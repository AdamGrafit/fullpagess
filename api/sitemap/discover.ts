import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // Try sitemap.xml
    let urls = await trySitemapUrl(`${baseUrl}/sitemap.xml`);
    if (urls && urls.length > 0) {
      await supabase
        .from('sitemap_jobs')
        .update({
          status: 'completed',
          urls,
          source: 'sitemap_xml',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return res.json({
        success: true,
        jobId: job.id,
        urls,
        source: 'sitemap_xml',
        message: `Found ${urls.length} URLs in sitemap.xml`,
      });
    }

    // Try sitemap_index.xml
    urls = await trySitemapUrl(`${baseUrl}/sitemap_index.xml`);
    if (urls && urls.length > 0) {
      const allUrls: string[] = [];
      for (const sitemapUrl of urls.slice(0, 10)) { // Limit to first 10 sitemaps
        const subUrls = await trySitemapUrl(sitemapUrl);
        if (subUrls) {
          allUrls.push(...subUrls);
        } else {
          allUrls.push(sitemapUrl);
        }
      }

      await supabase
        .from('sitemap_jobs')
        .update({
          status: 'completed',
          urls: allUrls,
          source: 'sitemap_index',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return res.json({
        success: true,
        jobId: job.id,
        urls: allUrls,
        source: 'sitemap_index',
        message: `Found ${allUrls.length} URLs in sitemap_index.xml`,
      });
    }

    // Try robots.txt
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
          const allUrls: string[] = [];
          for (const sitemapUrl of sitemapUrls.slice(0, 10)) {
            const subUrls = await trySitemapUrl(sitemapUrl);
            if (subUrls) {
              allUrls.push(...subUrls);
            }
          }

          if (allUrls.length > 0) {
            await supabase
              .from('sitemap_jobs')
              .update({
                status: 'completed',
                urls: allUrls,
                source: 'robots_txt',
                completed_at: new Date().toISOString(),
              })
              .eq('id', job.id);

            return res.json({
              success: true,
              jobId: job.id,
              urls: allUrls,
              source: 'robots_txt',
              message: `Found ${allUrls.length} URLs from robots.txt`,
            });
          }
        }
      }
    } catch {
      // Continue
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
