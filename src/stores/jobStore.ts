import { create } from 'zustand';
import type { SitemapJob, CrawlJob, ScreenshotJob } from '../types/database.types';

interface JobState {
  // Sitemap jobs
  sitemapJobs: SitemapJob[];
  currentSitemapJob: SitemapJob | null;

  // Crawl jobs
  crawlJobs: CrawlJob[];
  currentCrawlJob: CrawlJob | null;

  // Screenshot jobs
  screenshotJobs: ScreenshotJob[];
  activeScreenshotJobIds: Set<string>;

  // Actions - Sitemap
  setSitemapJobs: (jobs: SitemapJob[]) => void;
  addSitemapJob: (job: SitemapJob) => void;
  updateSitemapJob: (id: string, updates: Partial<SitemapJob>) => void;
  setCurrentSitemapJob: (job: SitemapJob | null) => void;

  // Actions - Crawl
  setCrawlJobs: (jobs: CrawlJob[]) => void;
  addCrawlJob: (job: CrawlJob) => void;
  updateCrawlJob: (id: string, updates: Partial<CrawlJob>) => void;
  setCurrentCrawlJob: (job: CrawlJob | null) => void;

  // Actions - Screenshot
  setScreenshotJobs: (jobs: ScreenshotJob[]) => void;
  addScreenshotJob: (job: ScreenshotJob) => void;
  addScreenshotJobs: (jobs: ScreenshotJob[]) => void;
  updateScreenshotJob: (id: string, updates: Partial<ScreenshotJob>) => void;
  removeScreenshotJob: (id: string) => void;

  // Selectors
  getPendingScreenshotJobs: () => ScreenshotJob[];
  getCompletedScreenshotJobs: () => ScreenshotJob[];
  getFailedScreenshotJobs: () => ScreenshotJob[];

  // Reset
  reset: () => void;
}

const initialState = {
  sitemapJobs: [],
  currentSitemapJob: null,
  crawlJobs: [],
  currentCrawlJob: null,
  screenshotJobs: [],
  activeScreenshotJobIds: new Set<string>(),
};

export const useJobStore = create<JobState>()((set, get) => ({
  ...initialState,

  // Sitemap actions
  setSitemapJobs: (jobs) => set({ sitemapJobs: jobs }),
  addSitemapJob: (job) =>
    set((state) => ({ sitemapJobs: [job, ...state.sitemapJobs] })),
  updateSitemapJob: (id, updates) =>
    set((state) => ({
      sitemapJobs: state.sitemapJobs.map((job) =>
        job.id === id ? { ...job, ...updates } : job
      ),
      currentSitemapJob:
        state.currentSitemapJob?.id === id
          ? { ...state.currentSitemapJob, ...updates }
          : state.currentSitemapJob,
    })),
  setCurrentSitemapJob: (job) => set({ currentSitemapJob: job }),

  // Crawl actions
  setCrawlJobs: (jobs) => set({ crawlJobs: jobs }),
  addCrawlJob: (job) =>
    set((state) => ({ crawlJobs: [job, ...state.crawlJobs] })),
  updateCrawlJob: (id, updates) =>
    set((state) => ({
      crawlJobs: state.crawlJobs.map((job) =>
        job.id === id ? { ...job, ...updates } : job
      ),
      currentCrawlJob:
        state.currentCrawlJob?.id === id
          ? { ...state.currentCrawlJob, ...updates }
          : state.currentCrawlJob,
    })),
  setCurrentCrawlJob: (job) => set({ currentCrawlJob: job }),

  // Screenshot actions
  setScreenshotJobs: (jobs) => set({ screenshotJobs: jobs }),
  addScreenshotJob: (job) =>
    set((state) => ({
      screenshotJobs: [job, ...state.screenshotJobs],
      activeScreenshotJobIds: new Set([...state.activeScreenshotJobIds, job.id]),
    })),
  addScreenshotJobs: (jobs) =>
    set((state) => ({
      screenshotJobs: [...jobs, ...state.screenshotJobs],
      activeScreenshotJobIds: new Set([
        ...state.activeScreenshotJobIds,
        ...jobs.map((j) => j.id),
      ]),
    })),
  updateScreenshotJob: (id, updates) =>
    set((state) => {
      const newActiveIds = new Set(state.activeScreenshotJobIds);
      if (updates.status === 'completed' || updates.status === 'failed') {
        newActiveIds.delete(id);
      }
      return {
        screenshotJobs: state.screenshotJobs.map((job) =>
          job.id === id ? { ...job, ...updates } : job
        ),
        activeScreenshotJobIds: newActiveIds,
      };
    }),
  removeScreenshotJob: (id) =>
    set((state) => ({
      screenshotJobs: state.screenshotJobs.filter((job) => job.id !== id),
      activeScreenshotJobIds: new Set(
        [...state.activeScreenshotJobIds].filter((jid) => jid !== id)
      ),
    })),

  // Selectors
  getPendingScreenshotJobs: () =>
    get().screenshotJobs.filter(
      (job) => job.status === 'pending' || job.status === 'processing'
    ),
  getCompletedScreenshotJobs: () =>
    get().screenshotJobs.filter((job) => job.status === 'completed'),
  getFailedScreenshotJobs: () =>
    get().screenshotJobs.filter((job) => job.status === 'failed'),

  // Reset
  reset: () => set(initialState),
}));
