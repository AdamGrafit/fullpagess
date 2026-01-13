import { useState, useEffect, useRef, useCallback } from 'react';
import { MainLayout } from '../components/layout/MainLayout';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { supabase } from '../services/supabase';
import { useAuth } from '../hooks/useAuth';

interface SitemapJob {
  id: string;
  domain: string;
  status: string;
  urls: string[];
  source: string | null;
  created_at: string;
  completed_at: string | null;
}

interface ScreenshotJob {
  id: string;
  url: string;
  status: string;
  screenshot_url: string | null;
  options: {
    deviceType?: string;
    fullPage?: boolean;
  };
  created_at: string;
  completed_at: string | null;
  sitemap_job_id: string | null;
}

interface Project {
  domain: string;
  sitemapJob: SitemapJob | null;
  screenshots: ScreenshotJob[];
  createdAt: string;
  totalUrls: number;
  completedScreenshots: number;
}

type TabType = 'screenshots' | 'urls';

export function ProjectsPage() {
  const { profile, session, isLoading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [selectedScreenshots, setSelectedScreenshots] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<Record<string, TabType>>({});
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [reanalyzingDomain, setReanalyzingDomain] = useState<string | null>(null);
  const [generatingForDomain, setGeneratingForDomain] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [urlFilter, setUrlFilter] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Screenshot generation options
  const [screenshotOptions, setScreenshotOptions] = useState({
    fullPage: true,
    viewport: 'desktop',
    delay: 2,
  });

  useEffect(() => {
    async function fetchProjects() {
      // Wait for auth to finish loading
      if (authLoading) {
        return;
      }

      // If no profile after auth is done, stop loading
      if (!profile?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        // Fetch sitemap jobs
        const { data: sitemapJobs, error: sitemapError } = await supabase
          .from('sitemap_jobs')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false });

        if (sitemapError) throw sitemapError;

        // Fetch screenshot jobs
        const { data: screenshotJobs, error: screenshotError } = await supabase
          .from('screenshot_jobs')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false });

        if (screenshotError) throw screenshotError;

        // Group by domain
        const projectMap = new Map<string, Project>();

        // Process sitemap jobs
        (sitemapJobs || []).forEach((job: SitemapJob) => {
          const domain = extractDomain(job.domain);
          if (!projectMap.has(domain)) {
            projectMap.set(domain, {
              domain,
              sitemapJob: job,
              screenshots: [],
              createdAt: job.created_at,
              totalUrls: Array.isArray(job.urls) ? job.urls.length : 0,
              completedScreenshots: 0,
            });
          }
        });

        // Process screenshot jobs
        (screenshotJobs || []).forEach((job: ScreenshotJob) => {
          const domain = extractDomain(job.url);
          if (!projectMap.has(domain)) {
            projectMap.set(domain, {
              domain,
              sitemapJob: null,
              screenshots: [],
              createdAt: job.created_at,
              totalUrls: 0,
              completedScreenshots: 0,
            });
          }
          const project = projectMap.get(domain)!;
          project.screenshots.push(job);
          if (job.status === 'completed') {
            project.completedScreenshots++;
          }
        });

        // Convert to array and sort by date
        const projectList = Array.from(projectMap.values()).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setProjects(projectList);
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProjects();
  }, [profile?.id, authLoading]);

  const extractDomain = (url: string): string => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success">Completed</Badge>;
      case 'processing':
        return <Badge variant="warning">Processing</Badge>;
      case 'failed':
        return <Badge variant="error">Failed</Badge>;
      default:
        return <Badge variant="default">Pending</Badge>;
    }
  };

  const toggleProjectExpanded = (domain: string) => {
    setExpandedProject(expandedProject === domain ? null : domain);
    setSelectedScreenshots(new Set());
    setSelectedUrls(new Set());
    setExpandedGroups(new Set());
    setUrlFilter('');
    // Default to screenshots tab if there are screenshots, otherwise urls
    const project = projects.find(p => p.domain === domain);
    if (project && !activeTab[domain]) {
      setActiveTab(prev => ({
        ...prev,
        [domain]: project.screenshots.length > 0 ? 'screenshots' : 'urls'
      }));
    }
  };

  const toggleScreenshotSelection = (id: string) => {
    const newSelected = new Set(selectedScreenshots);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedScreenshots(newSelected);
  };

  const selectAllScreenshots = (project: Project) => {
    const completed = project.screenshots.filter(s => s.status === 'completed' && s.screenshot_url);
    setSelectedScreenshots(new Set(completed.map(s => s.id)));
  };

  const deselectAllScreenshots = () => {
    setSelectedScreenshots(new Set());
  };

  const toggleUrlSelection = (url: string) => {
    const newSelected = new Set(selectedUrls);
    if (newSelected.has(url)) {
      newSelected.delete(url);
    } else {
      newSelected.add(url);
    }
    setSelectedUrls(newSelected);
  };

  const selectAllUrls = (urls: string[]) => {
    setSelectedUrls(new Set(urls));
  };

  const deselectAllUrls = () => {
    setSelectedUrls(new Set());
  };

  const downloadSelected = async (project: Project) => {
    const selected = project.screenshots.filter(s => selectedScreenshots.has(s.id) && s.screenshot_url);
    if (selected.length === 0) return;

    if (selected.length === 1) {
      window.open(selected[0].screenshot_url!, '_blank');
      return;
    }

    // For multiple files, dynamically import JSZip
    const JSZip = (await import('jszip')).default;
    const { saveAs } = await import('file-saver');

    const zip = new JSZip();

    await Promise.all(selected.map(async (job, index) => {
      if (!job.screenshot_url) return;
      try {
        const response = await fetch(job.screenshot_url);
        const blob = await response.blob();
        const filename = `${(index + 1).toString().padStart(2, '0')}-${extractPath(job.url)}.png`;
        zip.file(filename, blob);
      } catch (err) {
        console.error(`Failed to download ${job.url}:`, err);
      }
    }));

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    saveAs(zipBlob, `${project.domain}-screenshots.zip`);
  };

  const extractPath = (url: string): string => {
    try {
      const urlObj = new URL(url);
      let path = urlObj.pathname.replace(/\//g, '-').replace(/^-|-$/g, '') || 'homepage';
      if (path.length > 40) path = path.substring(0, 40);
      return path;
    } catch {
      return 'screenshot';
    }
  };

  const getPathPrefix = (url: string): string => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      return pathParts[0] || 'homepage';
    } catch {
      return 'other';
    }
  };

  const groupScreenshotsByPath = (screenshots: ScreenshotJob[]): Record<string, ScreenshotJob[]> => {
    const groups: Record<string, ScreenshotJob[]> = {};

    screenshots.forEach(screenshot => {
      const groupKey = getPathPrefix(screenshot.url);
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(screenshot);
    });

    // Sort groups by count (descending)
    const sortedEntries = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
    return Object.fromEntries(sortedEntries);
  };

  const toggleGroupExpanded = (group: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(group)) {
      newExpanded.delete(group);
    } else {
      newExpanded.add(group);
    }
    setExpandedGroups(newExpanded);
  };

  const handleReanalyze = async (project: Project) => {
    if (!session?.access_token) return;

    setReanalyzingDomain(project.domain);
    try {
      const response = await fetch('/api/sitemap/discover', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ domain: project.domain }),
      });

      const data = await response.json();
      if (response.ok && data.urls) {
        // Update the project's sitemap job with new URLs
        setProjects(prev => prev.map(p => {
          if (p.domain === project.domain) {
            return {
              ...p,
              sitemapJob: p.sitemapJob ? {
                ...p.sitemapJob,
                urls: data.urls,
              } : null,
              totalUrls: data.urls.length,
            };
          }
          return p;
        }));
      }
    } catch (err) {
      console.error('Failed to re-analyze sitemap:', err);
    } finally {
      setReanalyzingDomain(null);
    }
  };

  const handleGenerateFromUrls = async (project: Project) => {
    if (!session?.access_token || selectedUrls.size === 0) return;

    setGeneratingForDomain(project.domain);
    try {
      const viewportPresets: Record<string, { width: number; height: number }> = {
        desktop: { width: 1920, height: 1080 },
        tablet: { width: 768, height: 1024 },
        mobile: { width: 375, height: 667 },
      };

      const response = await fetch('/api/screenshots/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          urls: Array.from(selectedUrls).map(url => ({
            url,
            fullPage: screenshotOptions.fullPage,
            viewport: viewportPresets[screenshotOptions.viewport],
            delay: screenshotOptions.delay,
          })),
          sitemapJobId: project.sitemapJob?.id,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        // Start polling for these jobs
        pollForScreenshotJobs(data.jobs.map((j: { id: string }) => j.id), project.domain);
      }
    } catch (err) {
      console.error('Failed to generate screenshots:', err);
      setGeneratingForDomain(null);
    }
  };

  const pollForScreenshotJobs = useCallback(async (jobIds: string[], domain: string) => {
    const pollInterval = setInterval(async () => {
      try {
        const { data: jobs, error } = await supabase
          .from('screenshot_jobs')
          .select('*')
          .in('id', jobIds);

        if (error) {
          console.error('Poll error:', error);
          return;
        }

        // Update the project's screenshots
        setProjects(prev => prev.map(p => {
          if (p.domain === domain) {
            const existingIds = new Set(p.screenshots.map(s => s.id));
            const newScreenshots = [...p.screenshots];

            (jobs || []).forEach((job: ScreenshotJob) => {
              if (existingIds.has(job.id)) {
                // Update existing
                const idx = newScreenshots.findIndex(s => s.id === job.id);
                if (idx >= 0) newScreenshots[idx] = job;
              } else {
                // Add new
                newScreenshots.unshift(job);
              }
            });

            return {
              ...p,
              screenshots: newScreenshots,
              completedScreenshots: newScreenshots.filter(s => s.status === 'completed').length,
            };
          }
          return p;
        }));

        // Check if all done
        const completed = (jobs || []).filter((j: ScreenshotJob) => j.status === 'completed' || j.status === 'failed').length;
        if (completed === jobIds.length) {
          clearInterval(pollInterval);
          setGeneratingForDomain(null);
          setSelectedUrls(new Set());
        }
      } catch (err) {
        console.error('Poll exception:', err);
      }
    }, 2000);

    // Stop after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setGeneratingForDomain(null);
    }, 10 * 60 * 1000);
  }, []);

  const filteredUrls = (urls: string[]) => {
    if (!urlFilter) return urls;
    const lower = urlFilter.toLowerCase();
    return urls.filter(url => url.toLowerCase().includes(lower));
  };


  // Screenshot card with scroll animation
  const ScreenshotCard = ({ screenshot }: { screenshot: ScreenshotJob }) => {
    const isFullPage = screenshot.options?.fullPage;
    const [isHovered, setIsHovered] = useState(false);

    return (
      <div
        className={`
          relative border rounded-lg overflow-hidden cursor-pointer transition-all
          ${selectedScreenshots.has(screenshot.id)
            ? 'border-primary-500 ring-2 ring-primary-200'
            : 'border-gray-200 hover:border-gray-300'
          }
        `}
        onClick={() => screenshot.status === 'completed' && toggleScreenshotSelection(screenshot.id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Checkbox */}
        {screenshot.status === 'completed' && screenshot.screenshot_url && (
          <div className="absolute top-2 left-2 z-10">
            <input
              type="checkbox"
              checked={selectedScreenshots.has(screenshot.id)}
              onChange={() => toggleScreenshotSelection(screenshot.id)}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        {/* Image with scroll animation */}
        <div className="aspect-video bg-gray-100 overflow-hidden">
          {screenshot.status === 'completed' && screenshot.screenshot_url ? (
            <img
              src={screenshot.screenshot_url}
              alt={screenshot.url}
              className={`
                w-full object-cover transition-[object-position] duration-[3s] ease-linear
                ${isFullPage && isHovered ? 'object-bottom' : 'object-top'}
              `}
              style={{ height: isFullPage ? 'auto' : '100%', minHeight: '100%' }}
            />
          ) : screenshot.status === 'failed' ? (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-2">
          <p className="text-xs text-gray-500 truncate" title={screenshot.url}>
            {extractPath(screenshot.url) || 'homepage'}
          </p>
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-gray-400">
              {screenshot.options?.deviceType || 'desktop'}
            </span>
            {getStatusBadge(screenshot.status)}
          </div>
        </div>
      </div>
    );
  };

  if (isLoading || authLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-600">View your sitemap discoveries and screenshots</p>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent>
              <div className="text-center py-12">
                <svg
                  className="w-16 h-16 text-gray-300 mx-auto mb-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No projects yet</h3>
                <p className="text-gray-500 mb-4">
                  Start by discovering a sitemap and generating screenshots.
                </p>
                <Button onClick={() => window.location.href = '/'}>
                  Create New Project
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => (
              <Card key={project.domain}>
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
                  action={
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReanalyze(project)}
                        disabled={reanalyzingDomain === project.domain}
                      >
                        {reanalyzingDomain === project.domain ? (
                          <>
                            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Re-analyze
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleProjectExpanded(project.domain)}
                      >
                        {expandedProject === project.domain ? 'Collapse' : 'Expand'}
                      </Button>
                    </div>
                  }
                >
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{project.domain}</h3>
                    {project.sitemapJob && getStatusBadge(project.sitemapJob.status)}
                  </div>
                  <p className="text-sm text-gray-500">
                    {project.totalUrls} URLs discovered | {project.completedScreenshots} screenshots | {formatDate(project.createdAt)}
                  </p>
                </CardHeader>

                {expandedProject === project.domain && (
                  <CardContent>
                    <div className="space-y-4" ref={containerRef}>
                      {/* Tabs */}
                      {(project.screenshots.length > 0 || project.totalUrls > 0) && (
                        <div className="flex border-b border-gray-200">
                          <button
                            onClick={() => setActiveTab(prev => ({ ...prev, [project.domain]: 'screenshots' }))}
                            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                              activeTab[project.domain] === 'screenshots'
                                ? 'border-primary-600 text-primary-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            Screenshots ({project.screenshots.length})
                          </button>
                          {project.totalUrls > 0 && (
                            <button
                              onClick={() => setActiveTab(prev => ({ ...prev, [project.domain]: 'urls' }))}
                              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                activeTab[project.domain] === 'urls'
                                  ? 'border-primary-600 text-primary-600'
                                  : 'border-transparent text-gray-500 hover:text-gray-700'
                              }`}
                            >
                              Discovered URLs ({project.totalUrls})
                            </button>
                          )}
                        </div>
                      )}

                      {/* Screenshots Tab */}
                      {activeTab[project.domain] === 'screenshots' && (
                        <>
                          {/* Screenshot Actions */}
                          {project.screenshots.length > 0 && (
                            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => selectAllScreenshots(project)}
                              >
                                Select All
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={deselectAllScreenshots}
                              >
                                Deselect All
                              </Button>
                              {selectedScreenshots.size > 0 && (
                                <Button
                                  size="sm"
                                  onClick={() => downloadSelected(project)}
                                >
                                  Download Selected ({selectedScreenshots.size})
                                </Button>
                              )}
                            </div>
                          )}

                          {/* Grouped Screenshots */}
                          {project.screenshots.length > 0 ? (
                            <div className="space-y-4">
                              {Object.entries(groupScreenshotsByPath(project.screenshots)).map(([group, screenshots]) => (
                                <div key={group} className="border rounded-lg overflow-hidden">
                                  <button
                                    onClick={() => toggleGroupExpanded(group)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                                  >
                                    <span className="font-medium text-gray-900">
                                      /{group} <span className="text-gray-500 font-normal">({screenshots.length})</span>
                                    </span>
                                    <svg
                                      className={`w-5 h-5 text-gray-400 transition-transform ${expandedGroups.has(group) ? 'rotate-180' : ''}`}
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>
                                  {expandedGroups.has(group) && (
                                    <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                      {screenshots.map((screenshot) => (
                                        <ScreenshotCard key={screenshot.id} screenshot={screenshot} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8 text-gray-500">
                              <p>No screenshots generated for this project yet.</p>
                              {project.totalUrls > 0 && (
                                <p className="text-sm mt-2">
                                  Switch to "Discovered URLs" tab to generate screenshots.
                                </p>
                              )}
                            </div>
                          )}
                        </>
                      )}

                      {/* URLs Tab */}
                      {activeTab[project.domain] === 'urls' && project.sitemapJob?.urls && (
                        <>
                          {/* URL Actions */}
                          <div className="space-y-4">
                            {/* Filter */}
                            <div className="flex items-center gap-4">
                              <input
                                type="text"
                                placeholder="Filter URLs..."
                                value={urlFilter}
                                onChange={(e) => setUrlFilter(e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              />
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => selectAllUrls(filteredUrls(project.sitemapJob?.urls || []))}
                              >
                                Select All
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={deselectAllUrls}
                              >
                                Deselect All
                              </Button>
                            </div>

                            {/* Screenshot Options */}
                            {selectedUrls.size > 0 && (
                              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                                <label className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={screenshotOptions.fullPage}
                                    onChange={(e) => setScreenshotOptions(prev => ({ ...prev, fullPage: e.target.checked }))}
                                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                  />
                                  <span className="text-sm text-gray-700">Full Page</span>
                                </label>
                                <select
                                  value={screenshotOptions.viewport}
                                  onChange={(e) => setScreenshotOptions(prev => ({ ...prev, viewport: e.target.value }))}
                                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                  <option value="desktop">Desktop (1920x1080)</option>
                                  <option value="tablet">Tablet (768x1024)</option>
                                  <option value="mobile">Mobile (375x667)</option>
                                </select>
                                <select
                                  value={screenshotOptions.delay}
                                  onChange={(e) => setScreenshotOptions(prev => ({ ...prev, delay: parseInt(e.target.value) }))}
                                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                  <option value="0">No delay</option>
                                  <option value="1">1s delay</option>
                                  <option value="2">2s delay</option>
                                  <option value="3">3s delay</option>
                                  <option value="5">5s delay</option>
                                </select>
                                <Button
                                  size="sm"
                                  onClick={() => handleGenerateFromUrls(project)}
                                  disabled={generatingForDomain === project.domain}
                                >
                                  {generatingForDomain === project.domain ? (
                                    <>
                                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                                      Generating...
                                    </>
                                  ) : (
                                    `Generate Screenshots (${selectedUrls.size})`
                                  )}
                                </Button>
                              </div>
                            )}

                            {/* URL List with scroll */}
                            <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                              {filteredUrls(project.sitemapJob.urls).map((url) => (
                                <div
                                  key={url}
                                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedUrls.has(url)}
                                    onChange={() => toggleUrlSelection(url)}
                                    className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                                  />
                                  <span className="text-sm text-gray-700 truncate flex-1" title={url}>
                                    {url}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

export default ProjectsPage;
