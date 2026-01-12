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
    // Use Puppeteer's bundled Chromium (don't specify executablePath)
    browser = await puppeteer.launch({
      headless: 'new',
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

// Ad/tracker domains to block
const AD_DOMAINS = [
  'googlesyndication.com',
  'doubleclick.net',
  'googleadservices.com',
  'facebook.com/tr',
  'google-analytics.com',
  'googletagmanager.com',
  'hotjar.com',
  'crazyegg.com',
  'mouseflow.com',
  'optimizely.com',
  'segment.com',
  'mixpanel.com',
  'adnxs.com',
  'adsrvr.org',
  'criteo.com',
  'outbrain.com',
  'taboola.com',
];

// Cookie consent/GDPR domains to block
const COOKIE_DOMAINS = [
  'cookiebot.com',
  'consentcdn.cookiebot.com',
  'consent.cookiebot.com',
  'cookiescript.com',
  'cookielaw.org',
  'onetrust.com',
  'cdn.cookielaw.org',
  'privacymanager.io',
  'trustarc.com',
  'consent.trustarc.com',
  'quantcast.com',
  'quantcast.mgr.consensu.org',
  'didomi.io',
  'sdk.privacy-center.org',
  'iubenda.com',
  'cdn.iubenda.com',
  'termly.io',
  'app.termly.io',
  'usercentrics.eu',
  'app.usercentrics.eu',
  'evidon.com',
  'consensu.org',
  'cookieconsent.com',
  'cc.cdn.civiccomputing.com',
  'klaro.org',
  'osano.com',
];

async function takeScreenshot(job) {
  const { id, url, user_id, options = {} } = job;

  // Extract options with defaults
  const {
    fullPage = true,
    scrollPage = false,
    fresh = false,
    noAds = false,
    noCookies = false,
    deviceType = 'desktop',
    delay = 2,
    format = 'png',
    quality = 90,
  } = options;

  console.log(`\n📸 Taking screenshot: ${url}`);
  console.log(`   Options: viewport=${deviceType}, fullPage=${fullPage}, scrollPage=${scrollPage}, noAds=${noAds}, noCookies=${noCookies}, fresh=${fresh}, format=${format}, delay=${delay}s`);

  const browser = await initBrowser();
  const page = await browser.newPage();

  try {
    // Set viewport
    const viewportConfig = VIEWPORTS[deviceType] || VIEWPORTS.desktop;
    await page.setViewport({ ...viewportConfig, deviceScaleFactor: 1 });

    // Set User-Agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Disable cache if fresh option is enabled
    if (fresh) {
      await page.setCacheEnabled(false);
      console.log('   Cache disabled');
    }

    // Block ads, trackers, and cookie consent scripts
    if (noAds || noCookies) {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const requestUrl = request.url().toLowerCase();
        const resourceType = request.resourceType();

        let shouldBlock = false;

        // Block ad domains if noAds is enabled
        if (noAds) {
          shouldBlock = AD_DOMAINS.some(domain => requestUrl.includes(domain)) ||
            (resourceType === 'image' && requestUrl.includes('ads')) ||
            (resourceType === 'script' && requestUrl.includes('analytics'));
        }

        // Block cookie consent domains if noCookies is enabled
        if (noCookies && !shouldBlock) {
          shouldBlock = COOKIE_DOMAINS.some(domain => requestUrl.includes(domain));
        }

        if (shouldBlock) {
          request.abort();
        } else {
          request.continue();
        }
      });
      console.log(`   Request blocking enabled (noAds=${noAds}, noCookies=${noCookies})`);
    }

    // Set longer timeouts for complex pages
    page.setDefaultNavigationTimeout(90000);
    page.setDefaultTimeout(90000);

    // Navigate to URL with fallback
    console.log(`   Navigating to: ${url}`);
    try {
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 60000,
      });
    } catch (navError) {
      if (navError.name === 'TimeoutError') {
        console.log('   Timeout on networkidle0, trying domcontentloaded...');
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
      } else {
        throw navError;
      }
    }

    // Scroll page to load lazy content if enabled
    if (scrollPage) {
      console.log('   Scrolling page...');
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 100;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      // Scroll back to top
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Remove cookie banners if noAds or noCookies is enabled
    if (noAds || noCookies) {
      await page.evaluate(() => {
        // Comprehensive list of cookie banner selectors
        const selectors = [
          // Generic cookie/consent selectors
          '[class*="cookie"]',
          '[id*="cookie"]',
          '[class*="gdpr"]',
          '[id*="gdpr"]',
          '[class*="consent"]',
          '[id*="consent"]',
          '[class*="privacy"]',
          '[id*="privacy"]',
          '.cookie-banner',
          '.cookie-notice',
          '.cookie-bar',
          '#cookie-bar',
          '#cookie-notice',
          '[class*="CookieBanner"]',
          '[class*="cookie-banner"]',

          // Cookiebot specific
          '#CybotCookiebotDialog',
          '#CybotCookiebotDialogBody',
          '[class*="CybotCookiebot"]',
          '#cookiebanner',
          '.cookiebanner',

          // OneTrust specific
          '#onetrust-consent-sdk',
          '#onetrust-banner-sdk',
          '.onetrust-pc-dark-filter',
          '[class*="onetrust"]',

          // Quantcast
          '#qc-cmp2-container',
          '.qc-cmp2-container',

          // TrustArc
          '#truste-consent-track',
          '.truste_overlay',
          '.truste_box_overlay',

          // Didomi
          '#didomi-host',
          '.didomi-popup-container',

          // Iubenda
          '.iubenda-cs-container',
          '#iubenda-cs-banner',

          // Termly
          '[class*="termly"]',
          '#termly-code-snippet-support',

          // Usercentrics
          '#usercentrics-root',
          '[class*="usercentrics"]',

          // Common overlay/modal patterns
          '[aria-label*="cookie"]',
          '[aria-label*="consent"]',
          '[role="dialog"][class*="cookie"]',
          '[role="dialog"][class*="consent"]',

          // Klaro
          '.klaro',
          '.cookie-modal',

          // Osano
          '.osano-cm-window',
          '.osano-cm-dialog',
        ];

        // Remove elements matching selectors
        selectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              el.remove();
            });
          } catch (e) {
            // Ignore invalid selector errors
          }
        });

        // Also remove any fixed/sticky elements at the bottom that might be cookie banners
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
          const style = window.getComputedStyle(el);
          const isFixed = style.position === 'fixed' || style.position === 'sticky';
          const isAtBottom = parseInt(style.bottom) <= 50 || el.getBoundingClientRect().bottom > window.innerHeight - 100;
          const hasText = el.textContent && el.textContent.toLowerCase();
          const isCookieRelated = hasText && (
            hasText.includes('cookie') ||
            hasText.includes('consent') ||
            hasText.includes('privacy') ||
            hasText.includes('gdpr') ||
            hasText.includes('accept all') ||
            hasText.includes('reject all')
          );

          if (isFixed && isAtBottom && isCookieRelated && el.offsetHeight < 400) {
            el.remove();
          }
        });

        // Remove any remaining overlay/backdrop elements
        document.querySelectorAll('[class*="overlay"], [class*="backdrop"], [class*="modal-backdrop"]').forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.position === 'fixed' && parseFloat(style.opacity) < 1) {
            el.remove();
          }
        });
      });
      console.log('   Cookie banners removed');
    }

    // Wait for specified delay
    if (delay > 0) {
      console.log(`   Waiting ${delay}s...`);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
    }

    // Determine file extension and content type
    const fileExt = format === 'jpeg' ? 'jpg' : 'png';
    const contentType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const filename = `screenshot_${id}_${Date.now()}.${fileExt}`;
    const filepath = path.join(SCREENSHOT_DIR, filename);

    // Take screenshot
    const screenshotOptions = {
      path: filepath,
      fullPage: fullPage,
      type: format === 'jpeg' ? 'jpeg' : 'png',
    };

    // Add quality for JPEG
    if (format === 'jpeg') {
      screenshotOptions.quality = Math.min(100, Math.max(10, quality));
    }

    await page.screenshot(screenshotOptions);
    console.log(`   ✅ Screenshot saved: ${filename}`);

    // Upload to Supabase Storage
    const fileBuffer = fs.readFileSync(filepath);
    const storagePath = `screenshots/${user_id}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('screenshots')
      .upload(storagePath, fileBuffer, {
        contentType: contentType,
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

    return { success: true, url: publicUrl };
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
      const { error: updateError } = await supabase
        .from('screenshot_jobs')
        .update({
          status: 'completed',
          screenshot_url: result.url,
          completed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (updateError) {
        console.error(`   ❌ DB update failed: ${updateError.message}`);
      } else {
        console.log(`   ✅ Job ${id} completed`);
      }
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
