import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Track API usage - one entry per screenshot
async function trackUsage(userId: string, endpoint: string, count: number = 1) {
  try {
    const today = new Date().toISOString().split('T')[0];
    // Insert multiple rows for accurate counting
    const rows = Array(count).fill({
      user_id: userId,
      endpoint,
      date: today,
      request_count: 1,
    });
    await supabase.from('api_usage').insert(rows);
  } catch (err) {
    console.error('Failed to track usage:', err);
  }
}

interface ScreenshotOptions {
  fullPage?: boolean;
  scrollPage?: boolean;
  fresh?: boolean;
  noAds?: boolean;
  noCookies?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  deviceType?: 'desktop' | 'tablet' | 'mobile';
  delay?: number;
  format?: 'png' | 'jpeg';
  quality?: number;
}

const viewportPresets = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
};

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

    const { urls, sitemapJobId, options = {} } = req.body as {
      urls: string[];
      sitemapJobId?: string;
      options?: ScreenshotOptions;
    };

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({ error: 'URLs array is required' });
    }

    if (urls.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 URLs per batch' });
    }

    // Resolve viewport from device type
    let viewport = options.viewport;
    if (!viewport && options.deviceType) {
      viewport = viewportPresets[options.deviceType];
    }
    if (!viewport) {
      viewport = viewportPresets.desktop;
    }

    // Create screenshot jobs
    const screenshotJobs = urls.map((url) => ({
      user_id: user.id,
      sitemap_job_id: sitemapJobId || null,
      url,
      status: 'pending' as const,
      options: {
        fullPage: options.fullPage ?? true,
        scrollPage: options.scrollPage ?? false,
        fresh: options.fresh ?? false,
        noAds: options.noAds ?? false,
        noCookies: options.noCookies ?? false,
        viewport,
        deviceType: options.deviceType ?? 'desktop',
        delay: options.delay ?? 2,
        format: options.format ?? 'png',
        quality: options.quality ?? 90,
      },
    }));

    const { data: jobs, error: jobsError } = await supabase
      .from('screenshot_jobs')
      .insert(screenshotJobs)
      .select();

    if (jobsError) throw jobsError;

    // Track usage - one entry per screenshot
    await trackUsage(user.id, 'screenshot', urls.length);

    return res.json({
      success: true,
      jobIds: jobs?.map((j) => j.id) || [],
      totalJobs: urls.length,
      message: `Queued ${urls.length} screenshot jobs for processing`,
    });
  } catch (error) {
    console.error('Generate screenshots error:', error);
    return res.status(500).json({
      error: 'Failed to generate screenshots',
      message: (error as Error).message,
    });
  }
}
