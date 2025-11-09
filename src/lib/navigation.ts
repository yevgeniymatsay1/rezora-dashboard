import { NavigateFunction } from 'react-router-dom';

/**
 * Centralized navigation utility that can work with or without React Router
 */
class NavigationService {
  private navigate: NavigateFunction | null = null;

  /**
   * Initialize with React Router's navigate function
   */
  setNavigate(navigate: NavigateFunction) {
    this.navigate = navigate;
  }

  /**
   * Navigate to a path
   */
  goTo(path: string, options?: { replace?: boolean; state?: any }) {
    if (this.navigate) {
      this.navigate(path, options);
    } else {
      // Fallback to window.location for non-React contexts
      if (options?.replace) {
        window.location.replace(path);
      } else {
        window.location.href = path;
      }
    }
  }

  /**
   * Go back in history
   */
  goBack() {
    if (this.navigate) {
      this.navigate(-1);
    } else {
      window.history.back();
    }
  }

  /**
   * Go forward in history
   */
  goForward() {
    if (this.navigate) {
      this.navigate(1);
    } else {
      window.history.forward();
    }
  }

  /**
   * Reload the current page
   */
  reload() {
    window.location.reload();
  }

  /**
   * Navigate to external URL
   */
  goToExternal(url: string, target: '_blank' | '_self' = '_self') {
    if (target === '_blank') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      window.location.href = url;
    }
  }

  /**
   * Get current pathname
   */
  getCurrentPath(): string {
    return window.location.pathname;
  }

  /**
   * Get current search params
   */
  getSearchParams(): URLSearchParams {
    return new URLSearchParams(window.location.search);
  }

  /**
   * Update search params without navigation
   */
  updateSearchParams(params: Record<string, string | null>) {
    const url = new URL(window.location.href);
    
    Object.entries(params).forEach(([key, value]) => {
      if (value === null) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, value);
      }
    });

    window.history.replaceState({}, '', url.toString());
  }
}

// Export singleton instance
export const navigationService = new NavigationService();

/**
 * Hook to initialize navigation service with React Router
 */
export function useNavigationService() {
  const navigate = useNavigate();
  
  useEffect(() => {
    navigationService.setNavigate(navigate);
    
    return () => {
      // Clean up on unmount
      navigationService.setNavigate(null);
    };
  }, [navigate]);
}

// Import React hooks
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';