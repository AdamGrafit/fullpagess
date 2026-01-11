-- ScreenshotPro Database Schema
-- Run this migration in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE (extends Supabase auth.users)
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT DEFAULT 'inactive' CHECK (status IN ('active', 'inactive')),
  api_key TEXT UNIQUE,
  api_key_created_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SITEMAP JOBS TABLE
-- ============================================
CREATE TABLE public.sitemap_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  urls JSONB DEFAULT '[]'::jsonb,
  source TEXT CHECK (source IN ('sitemap_xml', 'sitemap_index', 'sitemap_html', 'robots_txt', 'screaming_frog')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- ============================================
-- CRAWL JOBS TABLE (Screaming Frog)
-- ============================================
CREATE TABLE public.crawl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  sitemap_job_id UUID REFERENCES public.sitemap_jobs(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  max_urls INTEGER DEFAULT 500,
  crawl_depth INTEGER DEFAULT 3,
  discovered_urls JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SCREENSHOT JOBS TABLE
-- ============================================
CREATE TABLE public.screenshot_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  sitemap_job_id UUID REFERENCES public.sitemap_jobs(id) ON DELETE SET NULL,
  url TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  options JSONB DEFAULT '{}'::jsonb,
  screenshot_url TEXT,
  thumbnail_url TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- ============================================
-- API USAGE TRACKING TABLE
-- ============================================
CREATE TABLE public.api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  api_key TEXT,
  endpoint TEXT NOT NULL,
  request_count INTEGER DEFAULT 1,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX idx_profiles_api_key ON public.profiles(api_key);
CREATE INDEX idx_sitemap_jobs_user_id ON public.sitemap_jobs(user_id);
CREATE INDEX idx_sitemap_jobs_status ON public.sitemap_jobs(status);
CREATE INDEX idx_crawl_jobs_user_id ON public.crawl_jobs(user_id);
CREATE INDEX idx_crawl_jobs_status ON public.crawl_jobs(status);
CREATE INDEX idx_screenshot_jobs_user_id ON public.screenshot_jobs(user_id);
CREATE INDEX idx_screenshot_jobs_status ON public.screenshot_jobs(status);
CREATE INDEX idx_screenshot_jobs_created_at ON public.screenshot_jobs(created_at DESC);
CREATE INDEX idx_api_usage_user_id_date ON public.api_usage(user_id, date);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sitemap_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screenshot_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Sitemap jobs policies
CREATE POLICY "Users can view own sitemap jobs" ON public.sitemap_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sitemap jobs" ON public.sitemap_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sitemap jobs" ON public.sitemap_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sitemap jobs" ON public.sitemap_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- Crawl jobs policies
CREATE POLICY "Users can view own crawl jobs" ON public.crawl_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own crawl jobs" ON public.crawl_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own crawl jobs" ON public.crawl_jobs
  FOR UPDATE USING (auth.uid() = user_id);

-- Screenshot jobs policies
CREATE POLICY "Users can view own screenshot jobs" ON public.screenshot_jobs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own screenshot jobs" ON public.screenshot_jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own screenshot jobs" ON public.screenshot_jobs
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own screenshot jobs" ON public.screenshot_jobs
  FOR DELETE USING (auth.uid() = user_id);

-- API usage policies
CREATE POLICY "Users can view own api usage" ON public.api_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own api usage" ON public.api_usage
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- ENABLE REALTIME FOR SPECIFIC TABLES
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.sitemap_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.crawl_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.screenshot_jobs;

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, created_at, updated_at)
  VALUES (NEW.id, NEW.email, NOW(), NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on profiles
CREATE OR REPLACE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- STORAGE BUCKET SETUP
-- ============================================
-- Note: Run this in Supabase Dashboard or via API
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('screenshots', 'screenshots', true);

-- Storage policies (run separately after creating bucket)
-- CREATE POLICY "Public read access for screenshots"
-- ON storage.objects FOR SELECT
-- USING (bucket_id = 'screenshots');

-- CREATE POLICY "Authenticated users can upload screenshots"
-- ON storage.objects FOR INSERT
-- WITH CHECK (bucket_id = 'screenshots' AND auth.role() = 'authenticated');
