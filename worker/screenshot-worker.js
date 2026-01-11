/**
 * Screenshot Worker
 * Processes screenshot jobs using Puppeteer
 */

import 'dotenv/config';
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '5000');
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || '/var/screenshotpro/screenshots';

// Viewport configurations
const VIEWPORTS = {
  desktop: { width: 1920, height: 1080 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
};

// Validate environment
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Ensure screenshot directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

console.log('==================================================');
console.log('ScreenshotPro Screenshot Worker');
console.log('==================================================');
console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log(`Screenshot Directory: ${SCREENSHOT_DIR}`);
console.log(`Poll Interval: ${POLL_INTERVAL}ms`);
console.log('==================================================');

let browser = null;

async function initBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: '/usr/bin/chromium-browser',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });
    console.log('Browser initialized');
  }
  return browser;
}

async function takeScreenshot(job) {
  const { id, url, viewport = 'desktop', full_page = true, delay = 2 } = job;

  console.log(`\n📸 Taking screenshot: ${url}`);
  console.log(`   Viewport: ${viewport}, Full page: ${full_page}, Delay: ${delay}s`);

  const browser = await initBrowser();
  const page = await browser.newPage();

  try {
    // Set viewport
    const viewportConfig = VIEWPORTS[viewport] || VIEWPORTS.desktop;
    await page.setViewport(viewportConfig);

    // Navigate to URL
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // Wait for specified delay (for lazy-loaded content)
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }

    // Take screenshot
    const filename = `screenshot_${id}_${Date.now()}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);

    await page.screenshot({
      path: filepath,
      fullPage: full_page,
      type: 'png',
    });

    console.log(`   ✅ Screenshot saved: ${filename}`);

    // Upload to Supabase Storage
    const fileBuffer = fs.readFileSync(filepath);
    const storagePath = `screenshots/${job.user_id}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('screenshots')
      .upload(storagePath, fileBuffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('screenshots')
      .getPublicUrl(storagePath);

    console.log(`   ✅ Uploaded to storage: ${storagePath}`);

    // Clean up local file
    fs.unlinkSync(filepath);

    return { success: true, url: publicUrl, storagePath };
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    await page.close();
  }
}

async function processJob(job) {
  const { id } = job;

  try {
    // Update status to processing
    await supabase
      .from('screenshot_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', id);

    // Take screenshot
    const result = await takeScreenshot(job);

    if (result.success) {
      // Update job as completed
      await supabase
        .from('screenshot_jobs')
        .update({
          status: 'completed',
          screenshot_url: result.url,
          storage_path: result.storagePath,
          completed_at: new Date().toISOString(),
        })
        .eq('id', id);

      console.log(`   ✅ Job ${id} completed`);
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error(`   ❌ Job ${id} failed: ${error.message}`);

    await supabase
      .from('screenshot_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id);
  }
}

async function pollForJobs() {
  try {
    // Get pending screenshot jobs
    const { data: jobs, error } = await supabase
      .from('screenshot_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error) {
      console.error('Error fetching jobs:', error.message);
      return;
    }

    if (jobs && jobs.length > 0) {
      console.log(`\n📋 Found ${jobs.length} pending screenshot job(s)`);

      for (const job of jobs) {
        await processJob(job);
      }
    }
  } catch (error) {
    console.error('Poll error:', error.message);
  }
}

// Main loop
async function main() {
  console.log('\nScreenshot Worker started. Polling for jobs...\n');

  // Initialize browser on startup
  await initBrowser();

  // Poll continuously
  setInterval(pollForJobs, POLL_INTERVAL);

  // Also poll immediately on start
  await pollForJobs();
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

main().catch(console.error);
