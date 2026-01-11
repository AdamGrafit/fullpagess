// Database types for ScreenshotPro
// These types match the Supabase database schema

export type UserRole = 'user' | 'admin';
export type UserStatus = 'active' | 'inactive';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type SitemapSource = 'sitemap_xml' | 'sitemap_index' | 'sitemap_html' | 'robots_txt' | 'screaming_frog';
export type DeviceType = 'desktop' | 'tablet' | 'mobile';

export interface Profile {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  role: UserRole;
  status: UserStatus;
  api_key: string | null;
  api_key_created_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SitemapJob {
  id: string;
  user_id: string;
  domain: string;
  status: JobStatus;
  urls: string[];
  source: SitemapSource | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface CrawlJob {
  id: string;
  user_id: string;
  sitemap_job_id: string;
  domain: string;
  status: JobStatus;
  max_urls: number;
  crawl_depth: number;
  discovered_urls: string[];
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  scroll?: boolean;
  refreshCache?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
  deviceType?: DeviceType;
  delay?: number;
}

export interface ScreenshotJob {
  id: string;
  user_id: string;
  sitemap_job_id: string | null;
  url: string;
  status: JobStatus;
  options: ScreenshotOptions;
  screenshot_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface ApiUsage {
  id: string;
  user_id: string;
  api_key: string;
  endpoint: string;
  request_count: number;
  date: string;
  created_at: string;
}

// Supabase Database type definition
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, 'id'>>;
      };
      sitemap_jobs: {
        Row: SitemapJob;
        Insert: Omit<SitemapJob, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<SitemapJob, 'id'>>;
      };
      crawl_jobs: {
        Row: CrawlJob;
        Insert: Omit<CrawlJob, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<CrawlJob, 'id'>>;
      };
      screenshot_jobs: {
        Row: ScreenshotJob;
        Insert: Omit<ScreenshotJob, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ScreenshotJob, 'id'>>;
      };
      api_usage: {
        Row: ApiUsage;
        Insert: Omit<ApiUsage, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ApiUsage, 'id'>>;
      };
    };
  };
}
