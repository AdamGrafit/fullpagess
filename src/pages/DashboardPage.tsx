import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { MainLayout } from '../components/layout/MainLayout';
import { supabase } from '../services/supabase';

interface UsageStats {
  sitemapCount: number;
  screenshotCount: number;
  thisMonth: number;
}

export function DashboardPage() {
  const { profile, updateProfile, generateApiKey, isLoading } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [usageStats, setUsageStats] = useState<UsageStats>({ sitemapCount: 0, screenshotCount: 0, thisMonth: 0 });

  // Fetch usage statistics
  useEffect(() => {
    async function fetchUsageStats() {
      if (!profile?.id) return;

      try {
        const { data, error } = await supabase
          .from('api_usage')
          .select('endpoint, request_count, date')
          .eq('user_id', profile.id);

        if (error) throw error;

        const now = new Date();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

        let sitemapCount = 0;
        let screenshotCount = 0;
        let thisMonth = 0;

        (data || []).forEach((row: { endpoint: string; request_count: number; date: string }) => {
          if (row.endpoint === 'sitemap_discovery') {
            sitemapCount += row.request_count;
          } else if (row.endpoint === 'screenshot' || row.endpoint === '/api/v1/screenshot') {
            screenshotCount += row.request_count;
          }

          if (row.date >= thisMonthStart) {
            thisMonth += row.request_count;
          }
        });

        setUsageStats({ sitemapCount, screenshotCount, thisMonth });
      } catch (err) {
        console.error('Failed to fetch usage stats:', err);
      }
    }

    fetchUsageStats();
  }, [profile?.id]);

  const handleSaveProfile = async () => {
    try {
      await updateProfile({ full_name: fullName, username });
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update profile:', error);
    }
  };

  const handleGenerateApiKey = async () => {
    setIsGeneratingKey(true);
    try {
      await generateApiKey();
    } catch (error) {
      console.error('Failed to generate API key:', error);
    } finally {
      setIsGeneratingKey(false);
    }
  };

  const handleCopyApiKey = async () => {
    if (profile?.api_key) {
      await navigator.clipboard.writeText(profile.api_key);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return key;
    return `${key.slice(0, 8)}${'*'.repeat(24)}${key.slice(-4)}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Manage your account and API access</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Account Information Card */}
          <Card>
            <CardHeader
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              }
              action={
                !isEditing ? (
                  <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}>
                    Edit
                  </Button>
                ) : null
              }
            >
              <h3 className="font-semibold text-gray-900">Account Information</h3>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <div className="space-y-4">
                  <Input
                    label="Full Name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                  />
                  <Input
                    label="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter a username"
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleSaveProfile} isLoading={isLoading} size="sm">
                      Save
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Email</p>
                    <p className="text-sm text-gray-900">{profile?.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Full Name</p>
                    <p className="text-sm text-gray-900">{profile?.full_name || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Username</p>
                    <p className="text-sm text-gray-900">{profile?.username || 'Not set'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Role</p>
                    <Badge variant={profile?.role === 'admin' ? 'info' : 'default'}>
                      {profile?.role || 'user'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
                    <Badge variant={profile?.status === 'active' ? 'success' : 'warning'}>
                      {profile?.status || 'inactive'}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* API Key Card */}
          <Card>
            <CardHeader
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              }
            >
              <h3 className="font-semibold text-gray-900">API Key</h3>
            </CardHeader>
            <CardContent>
              {profile?.api_key ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Your API Key</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-gray-100 px-3 py-2 rounded font-mono truncate">
                        {maskApiKey(profile.api_key)}
                      </code>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCopyApiKey}
                      >
                        {copySuccess ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Created</p>
                    <p className="text-sm text-gray-900">{formatDate(profile.api_key_created_at)}</p>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleGenerateApiKey}
                      isLoading={isGeneratingKey}
                    >
                      Regenerate Key
                    </Button>
                    <p className="text-xs text-gray-500 mt-2">
                      Warning: This will invalidate your current API key
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-500 text-sm mb-4">
                    No API key generated yet. Generate one to use the API.
                  </p>
                  <Button
                    onClick={handleGenerateApiKey}
                    isLoading={isGeneratingKey}
                  >
                    Generate API Key
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account Dates Card */}
          <Card>
            <CardHeader
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              }
            >
              <h3 className="font-semibold text-gray-900">Account Dates</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Registered</p>
                  <p className="text-sm text-gray-900">{formatDate(profile?.created_at || null)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Last Updated</p>
                  <p className="text-sm text-gray-900">{formatDate(profile?.updated_at || null)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage Statistics */}
        <Card>
          <CardHeader
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            }
          >
            <h3 className="font-semibold text-gray-900">Usage Statistics</h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">{usageStats.sitemapCount}</p>
                <p className="text-xs text-gray-500 uppercase">Sitemap Discoveries</p>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-2xl font-bold text-gray-900">{usageStats.screenshotCount}</p>
                <p className="text-xs text-gray-500 uppercase">Screenshots</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-primary-600">{usageStats.thisMonth}</p>
                <p className="text-xs text-gray-500 uppercase">This Month</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Documentation */}
        <Card>
          <CardHeader
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            }
          >
            <h3 className="font-semibold text-gray-900">API Documentation</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <p className="text-gray-600">
                Use your API key to access the API programmatically. Include it in the
                <code className="bg-gray-100 px-1 mx-1 rounded text-sm">X-API-Key</code> header.
              </p>

              {/* Sitemap Discovery Endpoint */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <Badge variant="success">POST</Badge>
                  Discover Sitemap
                </h4>
                <p className="text-sm text-gray-600 mb-3">
                  Discover all URLs from a website's sitemap. Returns a list of page URLs found.
                </p>
                <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm text-gray-100">
{`curl -X POST https://fullpagess.vercel.app/api/v1/sitemap \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "domain": "example.com"
  }'`}
                  </pre>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Response includes: <code className="bg-gray-100 px-1 rounded">urls</code> (array), <code className="bg-gray-100 px-1 rounded">count</code>, <code className="bg-gray-100 px-1 rounded">source</code>
                </p>
              </div>

              {/* Screenshot Endpoint */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <Badge variant="success">POST</Badge>
                  Generate Screenshot
                </h4>
                <p className="text-sm text-gray-600 mb-3">
                  Queue a screenshot job for a URL. Poll the status endpoint for results.
                </p>
                <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm text-gray-100">
{`curl -X POST https://fullpagess.vercel.app/api/v1/screenshot \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "url": "https://example.com",
    "options": {
      "fullPage": true,
      "deviceType": "desktop",
      "delay": 2,
      "noAds": true,
      "noCookies": true,
      "format": "png"
    }
  }'`}
                  </pre>
                </div>
                <div className="mt-3 text-xs text-gray-500 space-y-1">
                  <p><strong>Options:</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li><code className="bg-gray-100 px-1 rounded">fullPage</code> - Capture full page (default: true)</li>
                    <li><code className="bg-gray-100 px-1 rounded">deviceType</code> - "desktop", "tablet", or "mobile"</li>
                    <li><code className="bg-gray-100 px-1 rounded">delay</code> - Wait seconds before capture (0-10)</li>
                    <li><code className="bg-gray-100 px-1 rounded">noAds</code> - Block ads and trackers</li>
                    <li><code className="bg-gray-100 px-1 rounded">noCookies</code> - Block cookie consent banners</li>
                    <li><code className="bg-gray-100 px-1 rounded">format</code> - "png" or "jpeg"</li>
                    <li><code className="bg-gray-100 px-1 rounded">quality</code> - JPEG quality 10-100</li>
                  </ul>
                </div>
              </div>

              {/* Check Job Status */}
              <div>
                <h4 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
                  <Badge variant="info">GET</Badge>
                  Check Screenshot Status
                </h4>
                <p className="text-sm text-gray-600 mb-3">
                  Check the status of a screenshot job and get the result URL when complete.
                </p>
                <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-sm text-gray-100">
{`curl -X GET https://fullpagess.vercel.app/api/v1/screenshot/JOB_ID \\
  -H "X-API-Key: YOUR_API_KEY"`}
                  </pre>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Response includes: <code className="bg-gray-100 px-1 rounded">status</code> (pending/processing/completed/failed), <code className="bg-gray-100 px-1 rounded">screenshot_url</code>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

export default DashboardPage;
