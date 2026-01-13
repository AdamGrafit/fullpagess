import { useState, useEffect } from 'react';
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

export function ProjectsPage() {
  const { profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [selectedScreenshots, setSelectedScreenshots] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchProjects() {
      if (!profile?.id) return;

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
  }, [profile?.id]);

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

  if (isLoading) {
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleProjectExpanded(project.domain)}
                    >
                      {expandedProject === project.domain ? 'Collapse' : 'Expand'}
                    </Button>
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
                    <div className="space-y-4">
                      {/* Actions */}
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

                      {/* Screenshots Grid */}
                      {project.screenshots.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                          {project.screenshots.map((screenshot) => (
                            <div
                              key={screenshot.id}
                              className={`
                                relative border rounded-lg overflow-hidden cursor-pointer transition-all
                                ${selectedScreenshots.has(screenshot.id)
                                  ? 'border-primary-500 ring-2 ring-primary-200'
                                  : 'border-gray-200 hover:border-gray-300'
                                }
                              `}
                              onClick={() => screenshot.status === 'completed' && toggleScreenshotSelection(screenshot.id)}
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

                              {/* Image */}
                              <div className="aspect-video bg-gray-100">
                                {screenshot.status === 'completed' && screenshot.screenshot_url ? (
                                  <img
                                    src={screenshot.screenshot_url}
                                    alt={screenshot.url}
                                    className="w-full h-full object-cover object-top"
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
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <p>No screenshots generated for this project yet.</p>
                        </div>
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
