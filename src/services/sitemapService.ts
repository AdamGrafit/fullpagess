import { supabase } from './supabase';
import type { SitemapJob, CrawlJob } from '../types/database.types';

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
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ScreenshotPro Sitemap Crawler' },
    });
    if (!response.ok) return null;
    const content = await response.text();
    return parseSitemapXml(content);
  } catch {
    return null;
  }
}

export interface DiscoveryResult {
  success: boolean;
  urls: string[];
  source: string;
  message: string;
}

// Main sitemap discovery function
export async function discoverSitemap(domain: string): Promise<DiscoveryResult> {
  // Normalize domain
  let baseUrl = domain.trim();
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }
  baseUrl = baseUrl.replace(/\/+$/, '');

  // Try sitemap.xml
  let urls = await trySitemapUrl(`${baseUrl}/sitemap.xml`);
  if (urls && urls.length > 0) {
    return { success: true, urls, source: 'sitemap_xml', message: 'Found sitemap.xml' };
  }

  // Try sitemap_index.xml
  urls = await trySitemapUrl(`${baseUrl}/sitemap_index.xml`);
  if (urls && urls.length > 0) {
    // This might contain links to other sitemaps, try to fetch those too
    const allUrls: string[] = [];
    for (const sitemapUrl of urls) {
      const subUrls = await trySitemapUrl(sitemapUrl);
      if (subUrls) {
        allUrls.push(...subUrls);
      } else {
        // If it's not a sitemap, it might be a regular URL
        allUrls.push(sitemapUrl);
      }
    }
    return { success: true, urls: allUrls, source: 'sitemap_index', message: 'Found sitemap_index.xml' };
  }

  // Try sitemap.html
  try {
    const response = await fetch(`${baseUrl}/sitemap.html`, {
      headers: { 'User-Agent': 'ScreenshotPro Sitemap Crawler' },
    });
    if (response.ok) {
      const html = await response.text();
      // Extract links from HTML sitemap
      const linkRegex = /href=["']([^"']+)["']/gi;
      const htmlUrls: string[] = [];
      let match;
      while ((match = linkRegex.exec(html)) !== null) {
        const url = match[1];
        if (url.startsWith(baseUrl) || url.startsWith('/')) {
          htmlUrls.push(url.startsWith('/') ? `${baseUrl}${url}` : url);
        }
      }
      if (htmlUrls.length > 0) {
        return { success: true, urls: htmlUrls, source: 'sitemap_html', message: 'Found sitemap.html' };
      }
    }
  } catch {
    // Continue to next method
  }

  // Try robots.txt
  try {
    const response = await fetch(`${baseUrl}/robots.txt`, {
      headers: { 'User-Agent': 'ScreenshotPro Sitemap Crawler' },
    });
    if (response.ok) {
      const robotsTxt = await response.text();
      const sitemapUrls = parseSitemapFromRobotsTxt(robotsTxt);
      if (sitemapUrls.length > 0) {
        const allUrls: string[] = [];
        for (const sitemapUrl of sitemapUrls) {
          const subUrls = await trySitemapUrl(sitemapUrl);
          if (subUrls) {
            allUrls.push(...subUrls);
          }
        }
        if (allUrls.length > 0) {
          return { success: true, urls: allUrls, source: 'robots_txt', message: 'Found sitemap in robots.txt' };
        }
      }
    }
  } catch {
    // Continue
  }

  // No sitemap found
  return {
    success: false,
    urls: [],
    source: '',
    message: 'No sitemap found. You can start a Screaming Frog crawl.',
  };
}

// Create a sitemap job in the database
export async function createSitemapJob(
  userId: string,
  domain: string
): Promise<SitemapJob> {
  const { data, error } = await supabase
    .from('sitemap_jobs')
    .insert({
      user_id: userId,
      domain,
      status: 'pending' as const,
      urls: [] as string[],
    } as never)
    .select()
    .single();

  if (error) throw error;
  return data as SitemapJob;
}

// Update sitemap job with discovered URLs
export async function updateSitemapJob(
  jobId: string,
  urls: string[],
  source: string
): Promise<SitemapJob> {
  const { data, error } = await supabase
    .from('sitemap_jobs')
    .update({
      status: 'completed' as const,
      urls,
      source,
      completed_at: new Date().toISOString(),
    } as never)
    .eq('id', jobId)
    .select()
    .single();

  if (error) throw error;
  return data as SitemapJob;
}

// Create a crawl job for Screaming Frog
export async function createCrawlJob(
  userId: string,
  sitemapJobId: string,
  domain: string,
  maxUrls: number = 500,
  crawlDepth: number = 3
): Promise<CrawlJob> {
  const { data, error } = await supabase
    .from('crawl_jobs')
    .insert({
      user_id: userId,
      sitemap_job_id: sitemapJobId,
      domain,
      status: 'pending' as const,
      max_urls: maxUrls,
      crawl_depth: crawlDepth,
      discovered_urls: [] as string[],
    } as never)
    .select()
    .single();

  if (error) throw error;
  return data as CrawlJob;
}

// Get user's sitemap jobs
export async function getSitemapJobs(userId: string): Promise<SitemapJob[]> {
  const { data, error } = await supabase
    .from('sitemap_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// Get crawl job by ID
export async function getCrawlJob(jobId: string): Promise<CrawlJob | null> {
  const { data, error } = await supabase
    .from('crawl_jobs')
    .select('*')
    .eq('id', jobId)
    .single();

  if (error) return null;
  return data;
}
