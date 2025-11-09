// @ts-nocheck
import { toast } from '@/hooks/use-toast';

// Network error handling with retry logic

interface NetworkError extends Error {
  response?: Response;
  status?: number;
  code?: string;
  originalError?: Error;
}

type OfflineQueueItem = () => Promise<unknown>;

interface RetryConfig {
  maxRetries?: number;
  retryDelay?: number;
  backoffMultiplier?: number;
  maxRetryDelay?: number;
  retryCondition?: (error: NetworkError, attempt: number) => boolean;
  onRetry?: (error: NetworkError, attempt: number) => void;
}

interface RequestConfig extends RequestInit {
  timeout?: number;
  retry?: RetryConfig | boolean;
  skipErrorHandling?: boolean;
}

class NetworkHandler {
  private defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
    maxRetryDelay: 30000,
    retryCondition: (error, attempt) => {
      // Retry on network errors and 5xx status codes
      if (!error.response) return true; // Network error
      const status = error.response?.status;
      return status >= 500 && status < 600;
    }
  };

  private activeRequests = new Map<string, AbortController>();
  private isOnline = navigator.onLine;
  private offlineQueue: OfflineQueueItem[] = [];

  constructor() {
    this.setupNetworkListeners();
  }

  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processOfflineQueue();
      toast({
        title: 'Connection Restored',
        description: 'You are back online.',
        variant: 'default'
      });
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      toast({
        title: 'Connection Lost',
        description: 'You are offline. Some features may be limited.',
        variant: 'destructive'
      });
    });
  }

  private async processOfflineQueue() {
    const queue = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const request of queue) {
      try {
        await request();
      } catch (error) {
        console.error('Failed to process offline queue request:', error);
      }
    }
  }

  private createTimeoutPromise(timeout: number, abortController: AbortController): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        abortController.abort();
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);
    });
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateRetryDelay(attempt: number, config: RetryConfig): number {
    const delay = config.retryDelay || this.defaultRetryConfig.retryDelay!;
    const multiplier = config.backoffMultiplier || this.defaultRetryConfig.backoffMultiplier!;
    const maxDelay = config.maxRetryDelay || this.defaultRetryConfig.maxRetryDelay!;
    
    const calculatedDelay = delay * Math.pow(multiplier, attempt - 1);
    return Math.min(calculatedDelay, maxDelay);
  }

  public async fetch(url: string, config: RequestConfig = {}): Promise<Response> {
    const {
      timeout = 30000,
      retry = true,
      skipErrorHandling = false,
      ...fetchOptions
    } = config;

    const retryConfig: RetryConfig = retry === true 
      ? this.defaultRetryConfig 
      : retry === false 
        ? { maxRetries: 0 } 
        : { ...this.defaultRetryConfig, ...retry };

    const requestKey = `${fetchOptions.method || 'GET'}_${url}`;
    
    // Cancel any existing request to the same endpoint
    if (this.activeRequests.has(requestKey)) {
      this.activeRequests.get(requestKey)?.abort();
    }

    let lastError: NetworkError | undefined;
    let attempt = 0;

    while (attempt <= retryConfig.maxRetries!) {
      attempt++;

      try {
        // Check if offline and queue if necessary
        if (!this.isOnline && fetchOptions.method !== 'GET') {
          return new Promise((resolve, reject) => {
            this.offlineQueue.push(async () => {
              try {
                const response = await this.performFetch(url, fetchOptions, timeout, requestKey);
                resolve(response);
              } catch (error) {
                reject(error);
              }
            });
            
            toast({
              title: 'Request Queued',
              description: 'Your request will be sent when connection is restored.',
              variant: 'default'
            });
          });
        }

        const response = await this.performFetch(url, fetchOptions, timeout, requestKey);

        // Check if response is ok
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as NetworkError;
          error.response = response;
          error.status = response.status;
          throw error;
        }

        return response;

      } catch (err) {
        const error = err as NetworkError;
        lastError = error;

        // Check if we should retry
        const shouldRetry = attempt <= retryConfig.maxRetries! && 
                          (!retryConfig.retryCondition || retryConfig.retryCondition(error, attempt));

        if (shouldRetry) {
          const retryDelay = this.calculateRetryDelay(attempt, retryConfig);
          
          if (retryConfig.onRetry) {
            retryConfig.onRetry(error, attempt);
          }

          // Show retry notification for user-initiated requests
          if (!skipErrorHandling && fetchOptions.method !== 'GET') {
            toast({
              title: 'Retrying Request',
              description: `Attempt ${attempt} of ${retryConfig.maxRetries}. Retrying in ${Math.round(retryDelay / 1000)}s...`,
              variant: 'default'
            });
          }

          await this.sleep(retryDelay);
        } else {
          break;
        }
      }
    }

    // All retries failed
    if (!skipErrorHandling) {
      this.handleNetworkError(lastError, url, fetchOptions.method || 'GET');
    }

    throw lastError;
  }

  private async performFetch(
    url: string, 
    fetchOptions: RequestInit, 
    timeout: number, 
    requestKey: string
  ): Promise<Response> {
    const abortController = new AbortController();
    this.activeRequests.set(requestKey, abortController);

    try {
      const fetchPromise = fetch(url, {
        ...fetchOptions,
        signal: abortController.signal
      });

      const response = timeout > 0
        ? await Promise.race([
            fetchPromise,
            this.createTimeoutPromise(timeout, abortController)
          ])
        : await fetchPromise;

      return response;

    } finally {
      this.activeRequests.delete(requestKey);
    }
  }

  private handleNetworkError(error: NetworkError, url: string, method: string) {
    let title = 'Network Error';
    let description = 'An error occurred while making the request.';
    let variant: 'default' | 'destructive' = 'destructive';

    if (error.message?.includes('timeout')) {
      title = 'Request Timeout';
      description = 'The request took too long to complete. Please try again.';
    } else if (error.message?.includes('abort')) {
      title = 'Request Cancelled';
      description = 'The request was cancelled.';
      variant = 'default';
    } else if (error.status >= 500) {
      title = 'Server Error';
      description = 'The server encountered an error. Please try again later.';
    } else if (error.status === 404) {
      title = 'Not Found';
      description = 'The requested resource was not found.';
    } else if (error.status === 401) {
      title = 'Unauthorized';
      description = 'Your session has expired. Please log in again.';
      // Redirect to login
      setTimeout(() => {
        window.location.href = '/auth';
      }, 2000);
    } else if (error.status === 403) {
      title = 'Access Denied';
      description = 'You do not have permission to perform this action.';
    } else if (error.status === 429) {
      title = 'Too Many Requests';
      description = 'Please slow down and try again later.';
    } else if (!navigator.onLine) {
      title = 'Offline';
      description = 'You are offline. Please check your connection.';
    }

    toast({
      title,
      description,
      variant
    });

    // Log to error handler
    if (window.errorHandler) {
      window.errorHandler.reportNetworkError(url, error.status || 0, error.message);
    }
  }

  public cancelRequest(url: string, method: string = 'GET') {
    const requestKey = `${method}_${url}`;
    const controller = this.activeRequests.get(requestKey);
    
    if (controller) {
      controller.abort();
      this.activeRequests.delete(requestKey);
    }
  }

  public cancelAllRequests() {
    this.activeRequests.forEach(controller => controller.abort());
    this.activeRequests.clear();
  }

  public isRequestActive(url: string, method: string = 'GET'): boolean {
    const requestKey = `${method}_${url}`;
    return this.activeRequests.has(requestKey);
  }

  public getActiveRequestCount(): number {
    return this.activeRequests.size;
  }

  public clearOfflineQueue() {
    this.offlineQueue = [];
  }

  public getOfflineQueueSize(): number {
    return this.offlineQueue.length;
  }
}

// Create singleton instance
const networkHandler = new NetworkHandler();

// Export enhanced fetch function
export const enhancedFetch = networkHandler.fetch.bind(networkHandler);

// Export other utilities
export const cancelRequest = networkHandler.cancelRequest.bind(networkHandler);
export const cancelAllRequests = networkHandler.cancelAllRequests.bind(networkHandler);
export const isRequestActive = networkHandler.isRequestActive.bind(networkHandler);
export const getActiveRequestCount = networkHandler.getActiveRequestCount.bind(networkHandler);
export const clearOfflineQueue = networkHandler.clearOfflineQueue.bind(networkHandler);
export const getOfflineQueueSize = networkHandler.getOfflineQueueSize.bind(networkHandler);

// React hook for network status
export function useNetworkStatus() {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline };
}

// Extend window object for global error handler
declare global {
  interface Window {
    errorHandler: typeof import('./errorHandler').default;
  }
}

export default networkHandler;