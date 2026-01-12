import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile } from '../types/database.types';
import { supabase, auth } from '../services/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  initialize: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  generateApiKey: () => Promise<string>;
  reset: () => void;
}

const initialState = {
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  isInitialized: false,
  error: null,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      setProfile: (profile) => set({ profile }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

      initialize: async () => {
        try {
          set({ isLoading: true, error: null });

          // Get current session
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.user) {
            set({ user: session.user, session });
            await get().fetchProfile();
          }

          // Set up auth state listener
          supabase.auth.onAuthStateChange(async (event, session) => {
            set({ user: session?.user ?? null, session });

            if (event === 'SIGNED_IN' && session?.user) {
              await get().fetchProfile();
            } else if (event === 'SIGNED_OUT') {
              set({ profile: null });
            }
          });
        } catch (error) {
          set({ error: (error as Error).message });
        } finally {
          set({ isLoading: false, isInitialized: true });
        }
      },

      signUp: async (email, password) => {
        try {
          set({ isLoading: true, error: null });
          await auth.signUp(email, password);
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      signIn: async (email, password) => {
        try {
          set({ isLoading: true, error: null });
          const { user, session } = await auth.signIn(email, password);
          set({ user, session });
          await get().fetchProfile();
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      signOut: async () => {
        try {
          set({ isLoading: true, error: null });
          await auth.signOut();
          set({ user: null, session: null, profile: null });
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      fetchProfile: async () => {
        const { user } = get();
        if (!user) return;

        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (error) throw error;
          set({ profile: data });
        } catch (error) {
          // Ignore AbortError (happens during React StrictMode double-render)
          if ((error as Error).name === 'AbortError') return;
          console.error('Error fetching profile:', error);
        }
      },

      updateProfile: async (updates) => {
        const { user } = get();
        if (!user) throw new Error('Not authenticated');

        try {
          set({ isLoading: true, error: null });

          const { data, error } = await supabase
            .from('profiles')
            .update(updates as never)
            .eq('id', user.id)
            .select()
            .single();

          if (error) throw error;
          set({ profile: data as Profile });
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      generateApiKey: async () => {
        const { user } = get();
        if (!user) throw new Error('Not authenticated');

        try {
          set({ isLoading: true, error: null });

          // Generate a UUID v4 API key
          const apiKey = crypto.randomUUID();

          const { data, error } = await supabase
            .from('profiles')
            .update({
              api_key: apiKey,
              api_key_created_at: new Date().toISOString(),
            } as never)
            .eq('id', user.id)
            .select()
            .single();

          if (error) throw error;
          set({ profile: data as Profile });
          return apiKey;
        } catch (error) {
          set({ error: (error as Error).message });
          throw error;
        } finally {
          set({ isLoading: false });
        }
      },

      reset: () => set(initialState),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Only persist minimal auth state
        user: state.user,
        session: state.session,
      }),
    }
  )
);
