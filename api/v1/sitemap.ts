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
  '/wp-sitemap.xml',
  '/sitemap-index.xml',
  '/page-sitemap.xml',
  '/post-sitemap.xml',
];

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
      headers: { 'User-Agent': 'ScreenshotPro API' },
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

// Check if URLs look like sitemap index entries
function isSitemapIndex(urls: string[]): boolean {
  if (urls.length === 0) return false;
  const xmlCount = urls.filter(u => u.endsWith('.xml')).length;
  return xmlCount > urls.length * 0.5;
}

// Expand sitemap index by fetching all sub-sitemaps
async function expandSitemapIndex(sitemapUrls: string[]): Promise<string[]> {
  const allUrls: string[] = [];
  for (const sitemapUrl of sitemapUrls.slice(0, 15)) {
    const subUrls = await trySitemapUrl(sitemapUrl);
    if (subUrls && subUrls.length > 0) {
      if (isSitemapIndex(subUrls)) {
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
  return [...new Set(allUrls)];
}

// Track API usage
async function trackUsage(userId: string, apiKey: string, endpoint: string) {
  try {
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('api_usage').insert({
      user_id: userId,
      api_key: apiKey,
      endpoint,
      date: today,
      request_count: 1,
    });
  } catch (err) {
    console.error('Failed to track usage:', err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify API key
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      return res.status(401).json({ error: 'API key is required in X-API-Key header' });
    }

    // Look up user by API key
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('api_key', apiKey)
      .single();

    if (profileError || !profile) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (profile.status !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    // Track API usage
    await trackUsage(profile.id, apiKey, 'sitemap_discovery');

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

    // First try robots.txt for sitemap references
    let foundUrls: string[] = [];
    let source: string | null = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${baseUrl}/robots.txt`, {
        headers: { 'User-Agent': 'ScreenshotPro API' },
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

    if (foundUrls.length > 0) {
      return res.json({
        success: true,
        domain: baseUrl,
        urls: foundUrls,
        count: foundUrls.length,
        source,
      });
    }

    return res.json({
      success: false,
      domain: baseUrl,
      urls: [],
      count: 0,
      source: null,
      message: 'No sitemap found for this domain',
    });
  } catch (error) {
    console.error('API sitemap error:', error);
    return res.status(500).json({
      error: 'Failed to discover sitemap',
      message: (error as Error).message,
    });
  }
}
