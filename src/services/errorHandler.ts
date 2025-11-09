// Global error handling service

interface ErrorReport {
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  timestamp: string;
  userAgent: string;
  url: string;
  userId?: string;
  sessionId?: string;
  errorType: 'unhandled-error' | 'unhandled-rejection' | 'network-error' | 'chunk-load-error';
  metadata?: Record<string, unknown>;
}

class ErrorHandlerService {
  private errorQueue: ErrorReport[] = [];
  private isOnline: boolean = navigator.onLine;
  private maxRetries: number = 3;
  private retryDelay: number = 1000;
  private sessionId: string;
  private userId: string | null = null;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.setupGlobalHandlers();
    this.setupNetworkListeners();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupGlobalHandlers() {
    // Handle unhandled errors
    window.addEventListener('error', (event) => {
      this.handleError({
        message: event.message,
        stack: event.error?.stack,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        errorType: this.isChunkLoadError(event.message) ? 'chunk-load-error' : 'unhandled-error'
      });

      // Prevent default error handling in production
      if (process.env.NODE_ENV === 'production') {
        event.preventDefault();
      }
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError({
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack,
        errorType: 'unhandled-rejection'
      });

      // Prevent default rejection handling in production
      if (process.env.NODE_ENV === 'production') {
        event.preventDefault();
      }
    });

    // Override console.error in production
    if (process.env.NODE_ENV === 'production') {
      const originalConsoleError = console.error;
      console.error = (...args) => {
        originalConsoleError.apply(console, args);
        this.handleError({
          message: args.map(arg => String(arg)).join(' '),
          errorType: 'unhandled-error',
          metadata: { consoleError: true }
        });
      };
    }
  }

  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushErrorQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  private isChunkLoadError(message: string): boolean {
    return /Loading chunk \d+ failed/.test(message) ||
           /Failed to fetch dynamically imported module/.test(message);
  }

  public setUserId(userId: string | null) {
    this.userId = userId;
  }

  public handleError(error: Partial<ErrorReport>) {
    const errorReport: ErrorReport = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      source: error.source,
      lineno: error.lineno,
      colno: error.colno,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: this.userId || undefined,
      sessionId: this.sessionId,
      errorType: error.errorType || 'unhandled-error',
      metadata: error.metadata
    };

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.group('🔴 Error Handler');
      console.error('Error:', errorReport.message);
      if (errorReport.stack) {
        console.error('Stack:', errorReport.stack);
      }
      console.table({
        Type: errorReport.errorType,
        URL: errorReport.url,
        Timestamp: errorReport.timestamp,
        Session: errorReport.sessionId
      });
      console.groupEnd();
    }

    // Add to queue
    this.errorQueue.push(errorReport);

    // Send immediately if online, otherwise queue
    if (this.isOnline) {
      this.sendErrorReport(errorReport);
    }

    // Special handling for chunk load errors
    if (error.errorType === 'chunk-load-error') {
      this.handleChunkLoadError();
    }
  }

  private handleChunkLoadError() {
    // Show user-friendly message for chunk load errors
    const message = 'A new version of the application is available. Please refresh the page.';
    
    // Check if toast is available
    const toastEvent = new CustomEvent('show-toast', {
      detail: {
        title: 'Update Available',
        description: message,
        variant: 'default',
        action: {
          label: 'Refresh',
          onClick: () => window.location.reload()
        }
      }
    });
    
    window.dispatchEvent(toastEvent);
  }

  private async sendErrorReport(errorReport: ErrorReport, retryCount: number = 0): Promise<void> {
    try {
      // In production, this would send to your error tracking service
      if (process.env.NODE_ENV === 'production') {
        // TODO: Implement actual error reporting endpoint
        const response = await fetch('/api/errors', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(errorReport)
        });

        if (!response.ok && retryCount < this.maxRetries) {
          setTimeout(() => {
            this.sendErrorReport(errorReport, retryCount + 1);
          }, this.retryDelay * Math.pow(2, retryCount));
        }
      }
    } catch (error) {
      console.error('Failed to send error report:', error);
      
      // If sending fails, keep in queue for later
      if (!this.errorQueue.includes(errorReport)) {
        this.errorQueue.push(errorReport);
      }
    }
  }

  private async flushErrorQueue() {
    const errors = [...this.errorQueue];
    this.errorQueue = [];

    for (const error of errors) {
      await this.sendErrorReport(error);
    }
  }

  // Public methods for manual error reporting
  public reportError(error: Error, metadata?: Record<string, unknown>) {
    this.handleError({
      message: error.message,
      stack: error.stack,
      errorType: 'unhandled-error',
      metadata
    });
  }

  public reportNetworkError(url: string, status: number, statusText: string) {
    this.handleError({
      message: `Network error: ${status} ${statusText}`,
      errorType: 'network-error',
      metadata: {
        url,
        status,
        statusText
      }
    });
  }

  public clearErrorQueue() {
    this.errorQueue = [];
  }

  public getErrorQueue(): ErrorReport[] {
    return [...this.errorQueue];
  }

  public getSessionId(): string {
    return this.sessionId;
  }
}

// Create singleton instance
const errorHandler = new ErrorHandlerService();

// Export for use in the application
export default errorHandler;

// Utility functions for common error scenarios
export function reportError(error: Error, metadata?: Record<string, unknown>) {
  errorHandler.reportError(error, metadata);
}

export function reportNetworkError(url: string, status: number, statusText: string) {
  errorHandler.reportNetworkError(url, status, statusText);
}

// React hook for error reporting
export function useErrorReporter() {
  return {
    reportError: (error: Error, metadata?: Record<string, unknown>) => {
      errorHandler.reportError(error, metadata);
    },
    reportNetworkError: (url: string, status: number, statusText: string) => {
      errorHandler.reportNetworkError(url, status, statusText);
    }
  };
}