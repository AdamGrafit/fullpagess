import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const {
    user,
    session,
    profile,
    isLoading,
    isInitialized,
    error,
    initialize,
    signUp,
    signIn,
    signOut,
    fetchProfile,
    updateProfile,
    generateApiKey,
  } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  return {
    user,
    session,
    profile,
    isLoading,
    isInitialized,
    isAuthenticated: !!user,
    error,
    signUp,
    signIn,
    signOut,
    fetchProfile,
    updateProfile,
    generateApiKey,
  };
}

export default useAuth;
