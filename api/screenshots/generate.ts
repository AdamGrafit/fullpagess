import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ScreenshotOptions {
  fullPage?: boolean;
  scroll?: boolean;
  refreshCache?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  deviceType?: 'desktop' | 'tablet' | 'mobile';
  delay?: number;
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
        scroll: options.scroll ?? false,
        refreshCache: options.refreshCache ?? false,
        viewport,
        deviceType: options.deviceType ?? 'desktop',
        delay: options.delay ?? 2,
      },
    }));

    const { data: jobs, error: jobsError } = await supabase
      .from('screenshot_jobs')
      .insert(screenshotJobs)
      .select();

    if (jobsError) throw jobsError;

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
