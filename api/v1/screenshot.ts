import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ScreenshotRequest {
  url: string;
  options?: {
    fullPage?: boolean;
    viewport?: { width: number; height: number };
    delay?: number;
    scroll?: boolean;
    refreshCache?: boolean;
  };
}

const viewportPresets = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
};

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
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('api_usage').upsert(
      {
        user_id: profile.id,
        api_key: apiKey,
        endpoint: '/api/v1/screenshot',
        date: today,
        request_count: 1,
      },
      {
        onConflict: 'user_id,date,endpoint',
        ignoreDuplicates: false,
      }
    );

    // Increment request count
    await supabase.rpc('increment_api_usage', {
      p_user_id: profile.id,
      p_date: today,
      p_endpoint: '/api/v1/screenshot',
    });

    const { url, options = {} } = req.body as ScreenshotRequest;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Resolve viewport
    const viewport = options.viewport || viewportPresets.desktop;

    // Create screenshot job
    const { data: job, error: jobError } = await supabase
      .from('screenshot_jobs')
      .insert({
        user_id: profile.id,
        url,
        status: 'pending',
        options: {
          fullPage: options.fullPage ?? true,
          scroll: options.scroll ?? false,
          refreshCache: options.refreshCache ?? false,
          viewport,
          delay: options.delay ?? 2,
        },
      })
      .select()
      .single();

    if (jobError) throw jobError;

    return res.json({
      success: true,
      jobId: job.id,
      status: 'pending',
      message: 'Screenshot job queued. Poll the status endpoint for results.',
      statusUrl: `/api/v1/screenshot/${job.id}`,
    });
  } catch (error) {
    console.error('API screenshot error:', error);
    return res.status(500).json({
      error: 'Failed to create screenshot job',
      message: (error as Error).message,
    });
  }
}
