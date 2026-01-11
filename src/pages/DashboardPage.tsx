import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { MainLayout } from '../components/layout/MainLayout';

export function DashboardPage() {
  const { profile, updateProfile, generateApiKey, isLoading } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [copySuccess, setCopySuccess] = useState(false);
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);

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

        {/* API Usage Instructions */}
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
            <h3 className="font-semibold text-gray-900">API Usage</h3>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <p className="text-gray-600 mb-4">
                Use your API key to generate screenshots programmatically. Include it in the
                <code className="bg-gray-100 px-1 rounded">X-API-Key</code> header.
              </p>
              <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                <pre className="text-sm text-gray-100">
{`curl -X POST https://your-domain.vercel.app/api/v1/screenshot \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "url": "https://example.com",
    "options": {
      "fullPage": true,
      "viewport": { "width": 1920, "height": 1080 },
      "delay": 2
    }
  }'`}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

export default DashboardPage;
