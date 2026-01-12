/**
 * Screaming Frog Crawl Worker
 *
 * This worker polls Supabase for pending crawl jobs and processes them
 * using Screaming Frog SEO Spider in headless mode.
 *
 * Requirements:
 * - Screaming Frog SEO Spider installed at /usr/bin/screamingfrogseospider
 * - Valid Screaming Frog license activated
 * - Node.js 18+
 *
 * Environment Variables:
 * - SUPABASE_URL: Your Supabase project URL
 * - SUPABASE_SERVICE_KEY: Your Supabase service role key
 * - SF_OUTPUT_DIR: Directory for Screaming Frog output files
 * - POLL_INTERVAL: Polling interval in milliseconds (default: 10000)
 */

import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';
import { readFile, mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { join } from 'path';
import 'dotenv/config';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SF_OUTPUT_DIR = process.env.SF_OUTPUT_DIR || '/tmp/screenshotpro/crawls';
const SF_PATH = process.env.SF_PATH || '/usr/bin/screamingfrogseospider';
const SF_CONFIG_DIR = process.env.SF_CONFIG_DIR || '/var/screenshotpro/configs';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '10000', 10);
const MAX_CRAWL_TIME = parseInt(process.env.MAX_CRAWL_TIME || '900000', 10); // 15 minutes

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

console.log('='.repeat(50));
console.log('ScreenshotPro Crawl Worker (Screaming Frog)');
console.log('='.repeat(50));
console.log(`Supabase URL: ${SUPABASE_URL}`);
console.log(`Output Directory: ${SF_OUTPUT_DIR}`);
console.log(`Config Directory: ${SF_CONFIG_DIR}`);
console.log(`Screaming Frog Path: ${SF_PATH}`);
console.log(`Poll Interval: ${POLL_INTERVAL}ms`);
console.log(`Max Crawl Time: ${MAX_CRAWL_TIME}ms`);
console.log('='.repeat(50));

/**
 * Check if Screaming Frog is installed
 */
function checkScreamingFrog() {
  if (!existsSync(SF_PATH)) {
    console.error(`Screaming Frog not found at ${SF_PATH}`);
    console.error('Please install Screaming Frog SEO Spider');
    return false;
  }
  console.log('✅ Screaming Frog found');
  return true;
}

/**
 * Run Screaming Frog crawl
 */
async function runCrawl(domain, jobId) {
  const outputDir = join(SF_OUTPUT_DIR, jobId);

  // Clean and create output directory
  try {
    await rm(outputDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore if doesn't exist
  }
  await mkdir(outputDir, { recursive: true });

  console.log(`Starting crawl for ${domain}`);
  console.log(`Output directory: ${outputDir}`);

  // Check for base config file
  const baseConfigPath = join(SF_CONFIG_DIR, 'base.seospiderconfig');
  const hasConfig = existsSync(baseConfigPath);

  return new Promise((resolve, reject) => {
    // Ensure domain has protocol
    const crawlUrl = domain.startsWith('http') ? domain : `https://${domain}`;

    // Build command arguments
    const args = [
      '--headless',
      '--crawl', crawlUrl,
      '--output-folder', outputDir,
      '--export-tabs', 'Internal:All',
    ];

    // Add config file if available
    if (hasConfig) {
      args.push('--config', baseConfigPath);
      console.log(`Using config file: ${baseConfigPath}`);
    }

    console.log(`Running: ${SF_PATH} ${args.join(' ')}`);

    const sfProcess = spawn(SF_PATH, args, {
      stdio: 'pipe',
    });

    let stdout = '';
    let stderr = '';

    sfProcess.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`SF: ${data.toString().trim()}`);
    });

    sfProcess.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`SF Error: ${data.toString().trim()}`);
    });

    sfProcess.on('close', (code) => {
      if (code === 0) {
        resolve({ outputDir, stdout, stderr });
      } else {
        reject(new Error(`Screaming Frog exited with code ${code}: ${stderr}`));
      }
    });

    sfProcess.on('error', (err) => {
      reject(err);
    });

    // Timeout handler
    const timeout = setTimeout(() => {
      sfProcess.kill('SIGTERM');
      setTimeout(() => {
        if (!sfProcess.killed) {
          sfProcess.kill('SIGKILL');
        }
      }, 5000);
      reject(new Error(`Crawl timed out after ${MAX_CRAWL_TIME}ms`));
    }, MAX_CRAWL_TIME);

    sfProcess.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

/**
 * Parse Screaming Frog CSV output
 */
async function parseCSVOutput(outputDir) {
  const csvPath = join(outputDir, 'internal_all.csv');

  if (!existsSync(csvPath)) {
    // Try alternative paths
    const altPaths = [
      join(outputDir, 'Internal_all.csv'),
      join(outputDir, 'internal_html.csv'),
      join(outputDir, 'Internal_html.csv'),
    ];

    for (const altPath of altPaths) {
      if (existsSync(altPath)) {
        return parseCSVFile(altPath);
      }
    }

    throw new Error(`CSV output not found in ${outputDir}`);
  }

  return parseCSVFile(csvPath);
}

/**
 * Parse CSV file
 */
async function parseCSVFile(csvPath) {
  console.log(`Parsing CSV: ${csvPath}`);

  let content = await readFile(csvPath, 'utf-8');

  // Remove BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    relaxColumnCount: true,
    bom: true,
  });

  const urls = [];

  for (const record of records) {
    // Screaming Frog uses "Address" column for URLs
    const url = record['Address'] || record['URL'] || record['address'] || record['url'];
    const statusCode = record['Status Code'] || record['status_code'];
    const contentType = record['Content Type'] || record['content_type'];

    if (url && url.startsWith('http')) {
      // Only include successful HTML pages
      if (!statusCode || statusCode === '200') {
        if (!contentType || contentType.includes('text/html')) {
          urls.push(url);
        }
      }
    }
  }

  console.log(`Found ${urls.length} URLs`);
  return [...new Set(urls)]; // Remove duplicates
}

/**
 * Process a single crawl job
 */
async function processCrawlJob(job) {
  console.log(`\nProcessing job ${job.id}`);
  console.log(`Domain: ${job.domain}`);

  try {
    // Update job status to processing
    await supabase
      .from('crawl_jobs')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // Run the crawl
    const { outputDir } = await runCrawl(job.domain, job.id);

    // Parse the results
    const urls = await parseCSVOutput(outputDir);

    // Update job with results
    await supabase
      .from('crawl_jobs')
      .update({
        status: 'completed',
        discovered_urls: urls,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // Update associated sitemap job if exists
    if (job.sitemap_job_id) {
      await supabase
        .from('sitemap_jobs')
        .update({
          status: 'completed',
          urls,
          source: 'screaming_frog',
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.sitemap_job_id);
    }

    // Cleanup output directory
    try {
      await rm(outputDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn(`Failed to cleanup ${outputDir}:`, cleanupErr.message);
    }

    console.log(`Job ${job.id} completed with ${urls.length} URLs`);
    return { success: true, urlCount: urls.length };
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error.message);

    // Update job with error
    await supabase
      .from('crawl_jobs')
      .update({
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    // Update associated sitemap job if exists
    if (job.sitemap_job_id) {
      await supabase
        .from('sitemap_jobs')
        .update({
          status: 'failed',
          error_message: error.message,
          completed_at: new Date().toISOString(),
        })
        .eq('id', job.sitemap_job_id);
    }

    return { success: false, error: error.message };
  }
}

/**
 * Poll for pending jobs
 */
async function pollForJobs() {
  try {
    // Get pending crawl jobs
    const { data: jobs, error } = await supabase
      .from('crawl_jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      console.error('Error fetching jobs:', error.message);
      return;
    }

    if (jobs && jobs.length > 0) {
      const job = jobs[0];
      await processCrawlJob(job);
    }
  } catch (error) {
    console.error('Poll error:', error.message);
  }
}

/**
 * Main loop
 */
async function main() {
  // Check Screaming Frog installation
  if (!checkScreamingFrog()) {
    console.error('Cannot start worker without Screaming Frog');
    process.exit(1);
  }

  // Ensure directories exist
  await mkdir(SF_OUTPUT_DIR, { recursive: true });
  await mkdir(SF_CONFIG_DIR, { recursive: true });

  console.log('\nWorker started. Polling for jobs...\n');

  // Start polling
  setInterval(pollForJobs, POLL_INTERVAL);

  // Initial poll
  await pollForJobs();
}

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('\nShutting down worker...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down worker...');
  process.exit(0);
});

// Start worker
main().catch((err) => {
  console.error('Worker error:', err);
  process.exit(1);
});
