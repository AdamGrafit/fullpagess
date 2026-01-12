import { useState, useEffect } from 'react';
import { MainLayout } from '../components/layout/MainLayout';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Toggle } from '../components/ui/Toggle';
import { Select } from '../components/ui/Select';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Badge } from '../components/ui/Badge';
import { supabase } from '../services/supabase';
import type { Session } from '@supabase/supabase-js';

interface DiscoveredUrl {
  url: string;
  selected: boolean;
}

interface CrawlJob {
  status: string;
  discovered_urls: string[] | null;
  error_message: string | null;
}

interface ScreenshotJob {
  id: string;
  url: string;
  status: string;
  screenshot_url: string | null;
  error_message: string | null;
}

type Step = 'input' | 'selection' | 'options' | 'generating';
type DiscoveryStatus = 'idle' | 'discovering' | 'crawling' | 'completed' | 'error';

export function GeneratorPage() {
  const [currentStep, setCurrentStep] = useState<Step>('input');
  const [domain, setDomain] = useState('');
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus>('idle');
  const [discoveryMessage, setDiscoveryMessage] = useState('');
  const [urls, setUrls] = useState<DiscoveredUrl[]>([]);
  const [searchFilter, setSearchFilter] = useState('');

  // Session state
  const [session, setSession] = useState<Session | null>(null);

  // Screenshot options
  const [fullPage, setFullPage] = useState(true);
  const [scrollPage, setScrollPage] = useState(false);
  const [refreshCache, setRefreshCache] = useState(false);
  const [noAds, setNoAds] = useState(false);
  const [noCookies, setNoCookies] = useState(false);
  const [viewport, setViewport] = useState('desktop');
  const [delay, setDelay] = useState('2');
  const [format, setFormat] = useState('png');
  const [quality, setQuality] = useState('90');

  // Generation progress
  const [generationProgress, setGenerationProgress] = useState({ completed: 0, total: 0 });

  // Screenshot jobs state
  const [screenshotJobs, setScreenshotJobs] = useState<ScreenshotJob[]>([]);

  // Listen for auth changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Initial session:', session ? 'exists' : 'null');
      setSession(session);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', _event, session ? 'session exists' : 'no session');
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const viewportOptions = [
    { value: 'desktop', label: 'Desktop (1920x1080)' },
    { value: 'tablet', label: 'Tablet (768x1024)' },
    { value: 'mobile', label: 'Mobile (375x667)' },
  ];

  const formatOptions = [
    { value: 'png', label: 'PNG (best quality)' },
    { value: 'jpeg', label: 'JPEG (smaller file)' },
  ];

  // Normalize domain - extract clean domain from any URL format
  const normalizeDomain = (input: string): string => {
    let cleaned = input.trim();

    // Remove protocol
    cleaned = cleaned.replace(/^https?:\/\//, '');

    // Remove www.
    cleaned = cleaned.replace(/^www\./, '');

    // Remove path, query, hash
    cleaned = cleaned.split('/')[0].split('?')[0].split('#')[0];

    // Remove port
    cleaned = cleaned.split(':')[0];

    return cleaned;
  };

  // Fallback polling function when Realtime doesn't work
  const pollForJobStatus = async (jobId: string, channel: ReturnType<typeof supabase.channel>) => {
    console.log('Starting polling fallback for job:', jobId);
    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('crawl_jobs')
          .select('status, discovered_urls, error_message')
          .eq('id', jobId)
          .single();

        if (error) {
          console.error('Poll error:', error);
          return;
        }

        const job = data as CrawlJob;
        console.log('Poll result:', job);

        if (job.status === 'completed' && job.discovered_urls) {
          clearInterval(pollInterval);
          channel.unsubscribe();
          const discoveredUrls = job.discovered_urls.map((url: string) => ({ url, selected: true }));
          setUrls(discoveredUrls);
          setDiscoveryStatus('completed');
          setDiscoveryMessage(`Found ${discoveredUrls.length} URLs via Screaming Frog crawl`);
          setCurrentStep('selection');
        } else if (job.status === 'failed') {
          clearInterval(pollInterval);
          channel.unsubscribe();
          setDiscoveryStatus('error');
          setDiscoveryMessage(job.error_message || 'Crawl failed');
        } else if (job.status === 'processing') {
          setDiscoveryMessage('Crawl in progress...');
        }
      } catch (err) {
        console.error('Poll exception:', err);
      }
    }, 3000); // Poll every 3 seconds

    // Stop polling after 5 minutes
    setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
  };

  // Polling function for screenshot jobs
  const pollForScreenshotJobs = (jobIds: string[]) => {
    console.log('Starting polling for screenshot jobs:', jobIds);

    // Check current session for debugging
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('Poll session check:', session ? `User: ${session.user.id}` : 'NO SESSION');
    });

    const pollInterval = setInterval(async () => {
      try {
        console.log('Poll tick - querying jobs with IDs:', jobIds);

        // Get current session for auth header
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!currentSession) {
          console.error('No session available for polling');
          return;
        }

        // Use direct fetch to avoid Supabase client issues
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const idsParam = `(${jobIds.join(',')})`;

        const response = await fetch(
          `${supabaseUrl}/rest/v1/screenshot_jobs?id=in.${idsParam}&select=id,url,status,screenshot_url,error_message`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${currentSession.access_token}`,
            },
          }
        );

        const data = await response.json();
        const error = response.ok ? null : { message: data.message || 'Query failed' };

        console.log('Poll raw response:', { data, error, dataLength: Array.isArray(data) ? data.length : 0 });

        if (error) {
          console.error('Screenshot poll error:', error);
          return;
        }

        const jobs = (Array.isArray(data) ? data : []) as ScreenshotJob[];
        console.log('Screenshot poll result:', jobs.length, 'jobs');
        if (jobs.length > 0) {
          console.log('First job status:', jobs[0].status, jobs[0].screenshot_url ? 'has URL' : 'no URL');
        }
        setScreenshotJobs(jobs);

        // Count completed/failed
        const completed = jobs.filter(j => j.status === 'completed').length;
        const failed = jobs.filter(j => j.status === 'failed').length;
        const done = completed + failed;

        console.log('Screenshot progress:', done, '/', jobIds.length);
        setGenerationProgress({ completed: done, total: jobIds.length });

        // All done?
        if (done === jobIds.length) {
          console.log('All screenshot jobs completed');
          clearInterval(pollInterval);
        }
      } catch (err) {
        console.error('Screenshot poll exception:', err);
      }
    }, 2000); // Poll every 2 seconds

    // Stop after 10 minutes
    setTimeout(() => clearInterval(pollInterval), 10 * 60 * 1000);
  };

  const handleDiscoverSitemap = async () => {
    console.log('handleDiscoverSitemap called, domain:', domain);
    if (!domain) return;

    const cleanDomain = normalizeDomain(domain);
    console.log('Normalized domain:', cleanDomain);

    setDiscoveryStatus('discovering');
    setDiscoveryMessage('Searching for sitemap.xml...');

    try {
      // Use session from state (set by onAuthStateChange)
      console.log('Using session from state:', session ? 'exists' : 'null');

      if (!session) {
        setDiscoveryStatus('error');
        setDiscoveryMessage('Please log in to discover sitemaps.');
        return;
      }

      console.log('Access token present:', !!session.access_token);

      // Call sitemap discovery API
      console.log('Calling /api/sitemap/discover with domain:', cleanDomain);
      const response = await fetch('/api/sitemap/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ domain: cleanDomain }),
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to discover sitemap');
      }

      if (data.success && data.urls.length > 0) {
        // Found URLs from sitemap
        const discoveredUrls = data.urls.map((url: string) => ({ url, selected: true }));
        setUrls(discoveredUrls);
        setDiscoveryStatus('completed');
        setDiscoveryMessage(`${data.message} (source: ${data.source})`);
        setCurrentStep('selection');
      } else if (data.requiresCrawl) {
        // No sitemap found, start Screaming Frog crawl
        setDiscoveryStatus('crawling');
        setDiscoveryMessage('No sitemap found. Starting Screaming Frog crawl...');

        // Call start-crawl API
        console.log('Starting crawl for domain:', cleanDomain);
        const crawlResponse = await fetch('/api/sitemap/start-crawl', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            domain: cleanDomain,
            sitemapJobId: data.jobId,
          }),
        });
        console.log('Crawl response status:', crawlResponse.status);

        const crawlData = await crawlResponse.json();
        console.log('Crawl data:', crawlData);

        if (!crawlResponse.ok) {
          throw new Error(crawlData.error || 'Failed to start crawl');
        }

        // API returns crawlJobId, not jobId
        const crawlJobId = crawlData.crawlJobId;
        console.log('Subscribing to crawl job:', crawlJobId);

        // Subscribe to crawl job updates via Supabase Realtime
        setDiscoveryMessage(`Crawl started. Job ID: ${crawlJobId}. Waiting for results...`);

        const channel = supabase
          .channel(`crawl-${crawlJobId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'crawl_jobs',
              filter: `id=eq.${crawlJobId}`,
            },
            (payload) => {
              console.log('Realtime payload received:', payload);
              const job = payload.new as { status: string; discovered_urls: string[] | null; error_message: string | null };

              if (job.status === 'completed' && job.discovered_urls) {
                const discoveredUrls = job.discovered_urls.map((url: string) => ({ url, selected: true }));
                setUrls(discoveredUrls);
                setDiscoveryStatus('completed');
                setDiscoveryMessage(`Found ${discoveredUrls.length} URLs via Screaming Frog crawl`);
                setCurrentStep('selection');
                channel.unsubscribe();
              } else if (job.status === 'failed') {
                setDiscoveryStatus('error');
                setDiscoveryMessage(job.error_message || 'Crawl failed');
                channel.unsubscribe();
              } else if (job.status === 'processing') {
                setDiscoveryMessage('Crawl in progress...');
              }
            }
          )
          .subscribe((status) => {
            console.log('Realtime subscription status:', status);
          });

        // Start polling immediately as primary method (Realtime is unreliable with RLS)
        pollForJobStatus(crawlJobId, channel);

        // Timeout after 5 minutes
        setTimeout(() => {
          channel.unsubscribe();
          if (discoveryStatus === 'crawling') {
            setDiscoveryStatus('error');
            setDiscoveryMessage('Crawl timed out. Please try again.');
          }
        }, 5 * 60 * 1000);
      } else {
        setDiscoveryStatus('error');
        setDiscoveryMessage('No URLs found.');
      }
    } catch (error) {
      console.error('Discovery error:', error);
      setDiscoveryStatus('error');
      setDiscoveryMessage((error as Error).message || 'Failed to discover URLs. Please try again.');
    }
  };

  const handleSelectAll = () => {
    setUrls(urls.map((u) => ({ ...u, selected: true })));
  };

  const handleDeselectAll = () => {
    setUrls(urls.map((u) => ({ ...u, selected: false })));
  };

  const toggleUrlSelection = (index: number) => {
    setUrls(
      urls.map((u, i) => (i === index ? { ...u, selected: !u.selected } : u))
    );
  };

  const filteredUrls = urls.filter((u) =>
    u.url.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const selectedCount = urls.filter((u) => u.selected).length;

  const handleGenerateScreenshots = async () => {
    const selectedUrls = urls.filter((u) => u.selected);
    if (selectedUrls.length === 0 || !session) return;

    console.log('Starting screenshot generation for', selectedUrls.length, 'URLs');
    setCurrentStep('generating');
    setGenerationProgress({ completed: 0, total: selectedUrls.length });
    setScreenshotJobs([]); // Reset jobs

    try {
      // Call API to create screenshot jobs
      const response = await fetch('/api/screenshots/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          urls: selectedUrls.map(u => u.url),
          options: {
            fullPage,
            scrollPage,
            fresh: refreshCache,
            noAds,
            noCookies,
            deviceType: viewport,
            delay: parseInt(delay),
            format,
            quality: parseInt(quality),
          },
        }),
      });

      console.log('Generate response status:', response.status);
      const data = await response.json();
      console.log('Generate response data:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create screenshot jobs');
      }

      // Store job IDs and start polling (API returns jobIds array directly)
      const jobIds = data.jobIds as string[];
      console.log('Created screenshot jobs:', jobIds);

      // Start polling for job status
      pollForScreenshotJobs(jobIds);

    } catch (error) {
      console.error('Screenshot generation error:', error);
      setCurrentStep('options');
      // Could add toast notification here
    }
  };

  const handleReset = () => {
    setCurrentStep('input');
    setDomain('');
    setDiscoveryStatus('idle');
    setDiscoveryMessage('');
    setUrls([]);
    setSearchFilter('');
    setGenerationProgress({ completed: 0, total: 0 });
    setScreenshotJobs([]);
  };

  const handleDownloadAll = () => {
    const completedJobs = screenshotJobs.filter(j => j.status === 'completed' && j.screenshot_url);
    if (completedJobs.length === 0) return;

    // For single file, just download directly
    if (completedJobs.length === 1 && completedJobs[0].screenshot_url) {
      window.open(completedJobs[0].screenshot_url, '_blank');
      return;
    }

    // For multiple files, open each in new tab
    for (const job of completedJobs) {
      if (job.screenshot_url) {
        window.open(job.screenshot_url, '_blank');
      }
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Screenshot Generator</h1>
          <p className="text-gray-600">Generate screenshots from your website</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-4 mb-8">
          {['input', 'selection', 'options', 'generating'].map((step, index) => (
            <div key={step} className="flex items-center">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${
                    currentStep === step
                      ? 'bg-primary-600 text-white'
                      : ['input', 'selection', 'options', 'generating'].indexOf(currentStep) > index
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }
                `}
              >
                {index + 1}
              </div>
              {index < 3 && (
                <div
                  className={`w-16 h-1 ml-2 ${
                    ['input', 'selection', 'options', 'generating'].indexOf(currentStep) > index
                      ? 'bg-green-600'
                      : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Domain Input */}
        {currentStep === 'input' && (
          <Card>
            <CardHeader
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                  />
                </svg>
              }
            >
              <h3 className="font-semibold text-gray-900">Step 1: Enter Domain</h3>
              <p className="text-sm text-gray-500">We'll discover all pages on your website</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Input
                  label="Website URL"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="https://example.com"
                  helperText="Enter the full URL including https://"
                />

                {discoveryStatus !== 'idle' && discoveryStatus !== 'completed' && (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-gray-600">{discoveryMessage}</span>
                  </div>
                )}

                {discoveryStatus === 'error' && (
                  <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm">
                    {discoveryMessage}
                  </div>
                )}

                <Button
                  onClick={handleDiscoverSitemap}
                  isLoading={discoveryStatus === 'discovering' || discoveryStatus === 'crawling'}
                  disabled={!domain}
                >
                  Fetch Sitemap
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: URL Selection */}
        {currentStep === 'selection' && (
          <Card>
            <CardHeader
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              }
              action={
                <Badge variant="info">
                  {selectedCount} of {urls.length} selected
                </Badge>
              }
            >
              <h3 className="font-semibold text-gray-900">Step 2: Select URLs</h3>
              <p className="text-sm text-gray-500">Choose which pages to screenshot</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Input
                    placeholder="Filter URLs..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="flex-1"
                  />
                  <Button variant="secondary" size="sm" onClick={handleSelectAll}>
                    Select All
                  </Button>
                  <Button variant="secondary" size="sm" onClick={handleDeselectAll}>
                    Deselect All
                  </Button>
                </div>

                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {filteredUrls.map((item) => (
                    <label
                      key={item.url}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => toggleUrlSelection(urls.findIndex((u) => u.url === item.url))}
                        className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700 truncate">{item.url}</span>
                    </label>
                  ))}
                </div>

                <div className="flex gap-4">
                  <Button variant="secondary" onClick={handleReset}>
                    Start Over
                  </Button>
                  <Button onClick={() => setCurrentStep('options')} disabled={selectedCount === 0}>
                    Continue ({selectedCount} URLs)
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Screenshot Options */}
        {currentStep === 'options' && (
          <Card>
            <CardHeader
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              }
            >
              <h3 className="font-semibold text-gray-900">Step 3: Screenshot Options</h3>
              <p className="text-sm text-gray-500">Configure how screenshots are captured</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Page Capture Options */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Page Capture</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Toggle
                      checked={fullPage}
                      onChange={setFullPage}
                      label="Full Page"
                      description="Capture the entire page, including content below the fold"
                    />
                    <Toggle
                      checked={scrollPage}
                      onChange={setScrollPage}
                      label="Scroll Page"
                      description="Scroll page before capture to load lazy-loaded content"
                    />
                  </div>
                </div>

                {/* Privacy & Performance Options */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Privacy & Performance</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Toggle
                      checked={refreshCache}
                      onChange={setRefreshCache}
                      label="Fresh Load"
                      description="Bypass browser cache for fresh content"
                    />
                    <Toggle
                      checked={noAds}
                      onChange={setNoAds}
                      label="Block Ads"
                      description="Block ads, trackers, and remove cookie banners"
                    />
                    <Toggle
                      checked={noCookies}
                      onChange={setNoCookies}
                      label="No Cookies"
                      description="Disable cookies during page load"
                    />
                  </div>
                </div>

                {/* Output Settings */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Output Settings</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Select
                      label="Viewport Size"
                      options={viewportOptions}
                      value={viewport}
                      onChange={setViewport}
                    />
                    <Input
                      label="Delay (seconds)"
                      type="number"
                      min="0"
                      max="10"
                      value={delay}
                      onChange={(e) => setDelay(e.target.value)}
                      helperText="Wait before capture (0-10)"
                    />
                    <Select
                      label="Format"
                      options={formatOptions}
                      value={format}
                      onChange={setFormat}
                    />
                    {format === 'jpeg' && (
                      <Input
                        label="Quality"
                        type="number"
                        min="10"
                        max="100"
                        value={quality}
                        onChange={(e) => setQuality(e.target.value)}
                        helperText="JPEG quality (10-100)"
                      />
                    )}
                  </div>
                </div>

                <div className="flex gap-4 pt-4 border-t border-gray-100">
                  <Button variant="secondary" onClick={() => setCurrentStep('selection')}>
                    Back
                  </Button>
                  <Button onClick={handleGenerateScreenshots}>
                    Generate {selectedCount} Screenshots
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Generation Progress */}
        {currentStep === 'generating' && (
          <Card>
            <CardHeader
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              }
            >
              <h3 className="font-semibold text-gray-900">Generating Screenshots</h3>
              <p className="text-sm text-gray-500">
                {generationProgress.completed} of {generationProgress.total} completed
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <ProgressBar
                  value={generationProgress.completed}
                  max={generationProgress.total}
                  showLabel
                  size="lg"
                  variant={
                    generationProgress.completed === generationProgress.total
                      ? 'success'
                      : 'primary'
                  }
                />

                {generationProgress.completed === generationProgress.total && generationProgress.total > 0 && (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                          className="w-8 h-8 text-green-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Screenshots Generated!
                      </h3>
                      <p className="text-gray-600">
                        {screenshotJobs.filter(j => j.status === 'completed').length} successful
                        {screenshotJobs.filter(j => j.status === 'failed').length > 0 &&
                          `, ${screenshotJobs.filter(j => j.status === 'failed').length} failed`}
                      </p>
                    </div>

                    {/* Screenshot Grid */}
                    {screenshotJobs.filter(j => j.status === 'completed' && j.screenshot_url).length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {screenshotJobs.filter(j => j.status === 'completed' && j.screenshot_url).map((job) => (
                          <div key={job.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                            <div className="aspect-video bg-gray-100 overflow-hidden">
                              <img
                                src={job.screenshot_url || ''}
                                alt={job.url}
                                className="w-full h-full object-cover object-top"
                              />
                            </div>
                            <div className="p-3">
                              <p className="text-xs text-gray-500 truncate mb-2">{job.url}</p>
                              <a
                                href={job.screenshot_url || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary-600 hover:underline"
                              >
                                Open Full Size
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Failed jobs */}
                    {screenshotJobs.filter(j => j.status === 'failed').length > 0 && (
                      <div className="bg-red-50 rounded-lg p-4">
                        <h4 className="text-sm font-medium text-red-800 mb-2">Failed Screenshots:</h4>
                        <ul className="text-xs text-red-600 space-y-1">
                          {screenshotJobs.filter(j => j.status === 'failed').map((job) => (
                            <li key={job.id} className="truncate">
                              {job.url}: {job.error_message || 'Unknown error'}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="flex justify-center gap-4 pt-4">
                      <Button variant="secondary" onClick={handleReset}>
                        Generate More
                      </Button>
                      <Button onClick={handleDownloadAll} disabled={screenshotJobs.filter(j => j.status === 'completed').length === 0}>
                        Download All
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}

export default GeneratorPage;
