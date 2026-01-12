import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Sitemap locations to try
const SITEMAP_PATHS = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemaps.xml',
  '/sitemap/',
  '/sitemap/sitemap.xml',
  '/wp-sitemap.xml',           // WordPress
  '/sitemap-index.xml',
  '/page-sitemap.xml',
  '/post-sitemap.xml',
];

interface UrlGroup {
  prefix: string;
  label: string;
  urls: string[];
  count: number;
}

// Group URLs by their path prefix
function groupUrls(urls: string[]): UrlGroup[] {
  const groups: Map<string, string[]> = new Map();

  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);

      // Determine group prefix (first path segment or root)
      let prefix = '/';
      let label = 'Homepage';

      if (pathParts.length > 0) {
        prefix = '/' + pathParts[0];
        label = pathParts[0].charAt(0).toUpperCase() + pathParts[0].slice(1).replace(/-/g, ' ');
      }

      if (!groups.has(prefix)) {
        groups.set(prefix, []);
      }
      groups.get(prefix)!.push(url);
    } catch {
      // Invalid URL, add to root group
      if (!groups.has('/')) {
        groups.set('/', []);
      }
      groups.get('/')!.push(url);
    }
  }

  // Convert to array and sort by count (largest first)
  const result: UrlGroup[] = [];
  for (const [prefix, groupUrls] of groups) {
    result.push({
      prefix,
      label: prefix === '/' ? 'Homepage' : prefix.slice(1).charAt(0).toUpperCase() + prefix.slice(2).replace(/-/g, ' '),
      urls: groupUrls,
      count: groupUrls.length,
    });
  }

  return result.sort((a, b) => b.count - a.count);
}

// Parse XML sitemap content
function parseSitemapXml(xmlContent: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>(.*?)<\/loc>/gi;
  let match;
  while ((match = locRegex.exec(xmlContent)) !== null) {
    urls.push(match[1]);
  }
  return urls;
}

// Parse sitemap from robots.txt
function parseSitemapFromRobotsTxt(robotsTxt: string): string[] {
  const sitemapUrls: string[] = [];
  const lines = robotsTxt.split('\n');
  for (const line of lines) {
    const trimmed = line.trim().toLowerCase();
    if (trimmed.startsWith('sitemap:')) {
      const url = line.substring(line.indexOf(':') + 1).trim();
      sitemapUrls.push(url);
    }
  }
  return sitemapUrls;
}

// Try to fetch and parse a sitemap URL
async function trySitemapUrl(url: string): Promise<string[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'ScreenshotPro Sitemap Crawler' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const content = await response.text();
    return parseSitemapXml(content);
  } catch {
    return null;
  }
}

// Check if URLs look like sitemap index entries (other sitemap URLs)
function isSitemapIndex(urls: string[]): boolean {
  if (urls.length === 0) return false;
  // If most URLs end with .xml, it's likely a sitemap index
  const xmlCount = urls.filter(u => u.endsWith('.xml')).length;
  return xmlCount > urls.length * 0.5;
}

// Expand sitemap index by fetching all sub-sitemaps
async function expandSitemapIndex(sitemapUrls: string[]): Promise<string[]> {
  const allUrls: string[] = [];
  for (const sitemapUrl of sitemapUrls.slice(0, 15)) { // Limit to first 15 sitemaps
    const subUrls = await trySitemapUrl(sitemapUrl);
    if (subUrls && subUrls.length > 0) {
      // Check if this is also an index (nested)
      if (isSitemapIndex(subUrls)) {
        // One level of nesting only
        for (const nestedUrl of subUrls.slice(0, 5)) {
          const nestedSubUrls = await trySitemapUrl(nestedUrl);
          if (nestedSubUrls) {
            allUrls.push(...nestedSubUrls);
          }
        }
      } else {
        allUrls.push(...subUrls);
      }
    }
  }
  return [...new Set(allUrls)]; // Remove duplicates
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify auth token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { domain } = req.body;
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    // Normalize domain
    let baseUrl = domain.trim();
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }
    baseUrl = baseUrl.replace(/\/+$/, '');

    // Create sitemap job
    const { data: job, error: jobError } = await supabase
      .from('sitemap_jobs')
      .insert({
        user_id: user.id,
        domain: baseUrl,
        status: 'processing',
        urls: [],
      })
      .select()
      .single();

    if (jobError) throw jobError;

    // First try robots.txt for sitemap references
    let foundUrls: string[] = [];
    let source: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${baseUrl}/robots.txt`, {
        headers: { 'User-Agent': 'ScreenshotPro Sitemap Crawler' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        const robotsTxt = await response.text();
        const sitemapUrls = parseSitemapFromRobotsTxt(robotsTxt);

        if (sitemapUrls.length > 0) {
          foundUrls = await expandSitemapIndex(sitemapUrls);
          if (foundUrls.length > 0) {
            source = 'robots_txt';
          }
        }
      }
    } catch {
      // Continue to other methods
    }

    // If robots.txt didn't work, try sitemap paths
    if (foundUrls.length === 0) {
      for (const path of SITEMAP_PATHS) {
        const sitemapUrl = `${baseUrl}${path}`;
        const urls = await trySitemapUrl(sitemapUrl);

        if (urls && urls.length > 0) {
          // Check if it's a sitemap index
          if (isSitemapIndex(urls)) {
            foundUrls = await expandSitemapIndex(urls);
          } else {
            foundUrls = urls;
          }

          if (foundUrls.length > 0) {
            source = path.replace(/^\//, '').replace(/\//g, '_') || 'sitemap';
            break;
          }
        }
      }
    }

    // Return results
    if (foundUrls.length > 0) {
      const groups = groupUrls(foundUrls);

      await supabase
        .from('sitemap_jobs')
        .update({
          status: 'completed',
          urls: foundUrls,
          source,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return res.json({
        success: true,
        jobId: job.id,
        urls: foundUrls,
        groups,
        source,
        message: `Found ${foundUrls.length} URLs in ${groups.length} groups`,
      });
    }

    // No sitemap found
    await supabase
      .from('sitemap_jobs')
      .update({
        status: 'failed',
        error_message: 'No sitemap found',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return res.json({
      success: false,
      jobId: job.id,
      urls: [],
      groups: [],
      source: null,
      message: 'No sitemap found. You can start a Screaming Frog crawl.',
      requiresCrawl: true,
    });
  } catch (error) {
    console.error('Sitemap discovery error:', error);
    return res.status(500).json({
      error: 'Failed to discover sitemap',
      message: (error as Error).message,
    });
  }
}
