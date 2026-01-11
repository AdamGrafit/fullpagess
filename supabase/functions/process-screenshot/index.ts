/**
 * Supabase Edge Function: process-screenshot
 *
 * This function is triggered by a database webhook when a new screenshot job is inserted.
 * It processes the screenshot using an external screenshot API (since Puppeteer/Chromium
 * is challenging to run in Deno runtime).
 *
 * Recommended screenshot APIs:
 * - screenshotone.com
 * - urlbox.io
 * - screenshot.guru
 * - Or your own screenshot service deployed on Railway/Render
 *
 * Deploy:
 * supabase functions deploy process-screenshot
 *
 * Configure webhook:
 * - Go to Database > Webhooks
 * - Create webhook on `screenshot_jobs` INSERT
 * - Point to this Edge Function URL
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

interface ScreenshotJob {
  id: string;
  user_id: string;
  url: string;
  status: string;
  options: {
    fullPage?: boolean;
    scroll?: boolean;
    refreshCache?: boolean;
    viewport?: { width: number; height: number };
    deviceType?: string;
    delay?: number;
  };
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: ScreenshotJob;
  schema: string;
  old_record: ScreenshotJob | null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const screenshotApiKey = Deno.env.get('SCREENSHOT_API_KEY');
    const screenshotApiUrl = Deno.env.get('SCREENSHOT_API_URL') || 'https://api.screenshotone.com/take';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse webhook payload
    const payload: WebhookPayload = await req.json();

    if (payload.type !== 'INSERT' || payload.table !== 'screenshot_jobs') {
      return new Response(
        JSON.stringify({ message: 'Ignored: Not a screenshot_jobs INSERT' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const job = payload.record;

    console.log(`Processing screenshot job: ${job.id}`);
    console.log(`URL: ${job.url}`);

    // Update job status to processing
    await supabase
      .from('screenshot_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    try {
      // Build screenshot API request
      const viewport = job.options.viewport || { width: 1920, height: 1080 };
      const params = new URLSearchParams({
        url: job.url,
        viewport_width: String(viewport.width),
        viewport_height: String(viewport.height),
        full_page: String(job.options.fullPage ?? true),
        delay: String((job.options.delay ?? 2) * 1000), // Convert to ms
        format: 'png',
        ...(screenshotApiKey && { access_key: screenshotApiKey }),
      });

      // Option 1: Use external screenshot API
      // const screenshotResponse = await fetch(`${screenshotApiUrl}?${params}`);
      //
      // if (!screenshotResponse.ok) {
      //   throw new Error(`Screenshot API error: ${screenshotResponse.status}`);
      // }
      //
      // const imageBuffer = await screenshotResponse.arrayBuffer();

      // Option 2: For development/testing, generate a placeholder
      // In production, replace this with actual screenshot API call
      const placeholderSvg = `
        <svg width="${viewport.width}" height="${viewport.height}" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#f3f4f6"/>
          <text x="50%" y="50%" text-anchor="middle" dy=".3em" font-family="Arial" font-size="24" fill="#6b7280">
            Screenshot: ${job.url}
          </text>
          <text x="50%" y="55%" text-anchor="middle" dy=".3em" font-family="Arial" font-size="14" fill="#9ca3af">
            ${viewport.width}x${viewport.height}
          </text>
        </svg>
      `;

      const encoder = new TextEncoder();
      const imageBuffer = encoder.encode(placeholderSvg);

      // Upload to Supabase Storage
      const filename = `${job.id}.svg`; // Use .png when using real screenshots
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('screenshots')
        .upload(`full/${filename}`, imageBuffer, {
          contentType: 'image/svg+xml', // Use 'image/png' for real screenshots
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`Storage upload error: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('screenshots')
        .getPublicUrl(`full/${filename}`);

      // Update job as completed
      await supabase
        .from('screenshot_jobs')
        .update({
          status: 'completed',
          screenshot_url: urlData.publicUrl,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      console.log(`Screenshot job ${job.id} completed`);

      return new Response(
        JSON.stringify({
          success: true,
          jobId: job.id,
          screenshotUrl: urlData.publicUrl,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error(`Screenshot job ${job.id} failed:`, error);

      // Update job as failed
      await supabase
        .from('screenshot_jobs')
        .update({
          status: 'failed',
          error_message: (error as Error).message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      return new Response(
        JSON.stringify({
          success: false,
          jobId: job.id,
          error: (error as Error).message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Edge function error:', error);

    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
