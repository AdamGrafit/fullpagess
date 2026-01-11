import { useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useJobStore } from '../stores/jobStore';
import { useAuth } from './useAuth';
import type { SitemapJob, CrawlJob, ScreenshotJob } from '../types/database.types';

export function useRealtimeSitemapJobs() {
  const { user } = useAuth();
  const { updateSitemapJob, addSitemapJob } = useJobStore();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('sitemap-jobs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sitemap_jobs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            addSitemapJob(payload.new as SitemapJob);
          } else if (payload.eventType === 'UPDATE') {
            updateSitemapJob(payload.new.id, payload.new as SitemapJob);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, updateSitemapJob, addSitemapJob]);
}

export function useRealtimeCrawlJobs() {
  const { user } = useAuth();
  const { updateCrawlJob, addCrawlJob } = useJobStore();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('crawl-jobs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crawl_jobs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            addCrawlJob(payload.new as CrawlJob);
          } else if (payload.eventType === 'UPDATE') {
            updateCrawlJob(payload.new.id, payload.new as CrawlJob);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, updateCrawlJob, addCrawlJob]);
}

export function useRealtimeScreenshotJobs() {
  const { user } = useAuth();
  const { updateScreenshotJob, addScreenshotJob } = useJobStore();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('screenshot-jobs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'screenshot_jobs',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            addScreenshotJob(payload.new as ScreenshotJob);
          } else if (payload.eventType === 'UPDATE') {
            updateScreenshotJob(payload.new.id, payload.new as ScreenshotJob);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, updateScreenshotJob, addScreenshotJob]);
}

// Combined hook for all job types
export function useRealtimeJobs() {
  useRealtimeSitemapJobs();
  useRealtimeCrawlJobs();
  useRealtimeScreenshotJobs();
}

export default useRealtimeJobs;
