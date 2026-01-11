import { useState } from 'react';
import { MainLayout } from '../components/layout/MainLayout';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Toggle } from '../components/ui/Toggle';
import { Select } from '../components/ui/Select';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Badge } from '../components/ui/Badge';
import { supabase } from '../services/supabase';

interface DiscoveredUrl {
  url: string;
  selected: boolean;
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

  // Screenshot options
  const [fullPage, setFullPage] = useState(true);
  const [scrollPage, setScrollPage] = useState(false);
  const [refreshCache, setRefreshCache] = useState(false);
  const [viewport, setViewport] = useState('desktop');
  const [delay, setDelay] = useState('2');

  // Generation progress
  const [generationProgress, setGenerationProgress] = useState({ completed: 0, total: 0 });

  const viewportOptions = [
    { value: 'desktop', label: 'Desktop (1920x1080)' },
    { value: 'tablet', label: 'Tablet (768x1024)' },
    { value: 'mobile', label: 'Mobile (375x667)' },
  ];

  const handleDiscoverSitemap = async () => {
    console.log('handleDiscoverSitemap called, domain:', domain);
    if (!domain) return;

    setDiscoveryStatus('discovering');
    setDiscoveryMessage('Searching for sitemap.xml...');

    try {
      // Get auth token
      console.log('Getting session...');
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Session:', session ? 'exists' : 'null');
      if (!session) {
        setDiscoveryStatus('error');
        setDiscoveryMessage('Please log in to discover sitemaps.');
        return;
      }

      // Call sitemap discovery API
      console.log('Calling /api/sitemap/discover...');
      const response = await fetch('/api/sitemap/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ domain }),
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
        const crawlResponse = await fetch('/api/sitemap/start-crawl', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            domain,
            sitemapJobId: data.jobId,
          }),
        });

        const crawlData = await crawlResponse.json();

        if (!crawlResponse.ok) {
          throw new Error(crawlData.error || 'Failed to start crawl');
        }

        // Subscribe to crawl job updates via Supabase Realtime
        setDiscoveryMessage(`Crawl started. Job ID: ${crawlData.jobId}. Waiting for results...`);

        const channel = supabase
          .channel(`crawl-${crawlData.jobId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'crawl_jobs',
              filter: `id=eq.${crawlData.jobId}`,
            },
            (payload) => {
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
          .subscribe();

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
    if (selectedUrls.length === 0) return;

    setCurrentStep('generating');
    setGenerationProgress({ completed: 0, total: selectedUrls.length });

    // Simulate screenshot generation
    for (let i = 0; i < selectedUrls.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      setGenerationProgress({ completed: i + 1, total: selectedUrls.length });
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  <Toggle
                    checked={refreshCache}
                    onChange={setRefreshCache}
                    label="Refresh Cache"
                    description="Bypass browser cache for fresh content"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    helperText="Wait time before taking screenshot (0-10)"
                  />
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

                {generationProgress.completed === generationProgress.total && (
                  <div className="text-center py-6">
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
                    <p className="text-gray-600 mb-6">
                      All {generationProgress.total} screenshots have been captured successfully.
                    </p>
                    <div className="flex justify-center gap-4">
                      <Button variant="secondary" onClick={handleReset}>
                        Generate More
                      </Button>
                      <Button>Download All (ZIP)</Button>
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
