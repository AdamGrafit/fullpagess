import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    const { sitemapJobId, domain, maxUrls = 500, crawlDepth = 3 } = req.body;

    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    // Create crawl job
    const { data: crawlJob, error: crawlError } = await supabase
      .from('crawl_jobs')
      .insert({
        user_id: user.id,
        sitemap_job_id: sitemapJobId,
        domain,
        status: 'pending',
        max_urls: maxUrls,
        crawl_depth: crawlDepth,
        discovered_urls: [],
      })
      .select()
      .single();

    if (crawlError) throw crawlError;

    // Update sitemap job status if provided
    if (sitemapJobId) {
      await supabase
        .from('sitemap_jobs')
        .update({
          status: 'processing',
          source: 'screaming_frog',
        })
        .eq('id', sitemapJobId);
    }

    return res.json({
      success: true,
      crawlJobId: crawlJob.id,
      message: 'Crawl job queued. The Screaming Frog worker will process it shortly.',
      estimatedTime: '2-5 minutes depending on site size',
    });
  } catch (error) {
    console.error('Start crawl error:', error);
    return res.status(500).json({
      error: 'Failed to start crawl',
      message: (error as Error).message,
    });
  }
}
