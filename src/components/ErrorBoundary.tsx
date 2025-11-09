import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Warning, ArrowsClockwise, House, CaretDown, CaretUp } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductionErrorFallback } from './ProductionErrorFallback';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
  resetKeys?: Array<string | number>;
  resetOnPropsChange?: boolean;
  isolate?: boolean;
  useProductionFallback?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorCount: number;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: number | null = null;
  private previousResetKeys: Array<string | number> = [];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0,
      showDetails: false
    };
    
    if (props.resetKeys) {
      this.previousResetKeys = props.resetKeys;
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError } = this.props;
    
    // Log error to console in development
    if (import.meta.env.MODE === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }

    // Call custom error handler if provided
    if (onError) {
      onError(error, errorInfo);
    }

    // Log to error reporting service in production
    if (import.meta.env.MODE === 'production') {
      this.logErrorToService(error, errorInfo);
    }

    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // Auto-reset after 10 seconds if error count is low
    if (this.state.errorCount < 3) {
      this.resetTimeoutId = window.setTimeout(() => {
        this.resetErrorBoundary();
      }, 10000);
    }
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys, resetOnPropsChange } = this.props;
    const { hasError } = this.state;
    
    // Reset when resetKeys change
    if (hasError && resetKeys) {
      const hasResetKeyChanged = resetKeys.some(
        (key, idx) => key !== this.previousResetKeys[idx]
      );
      
      if (hasResetKeyChanged) {
        this.resetErrorBoundary();
        this.previousResetKeys = resetKeys;
      }
    }
    
    // Reset when props change if enabled
    if (hasError && resetOnPropsChange && prevProps.children !== this.props.children) {
      this.resetErrorBoundary();
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  logErrorToService = (error: Error, errorInfo: ErrorInfo) => {
    // In production, this would send to Sentry, LogRocket, etc.
    const errorData = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    // TODO: Implement actual error reporting service
    console.error('Error logged to service:', errorData);
  };

  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }
    
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    });
  };

  toggleDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails
    }));
  };

  render() {
    const { hasError, error, errorInfo, errorCount, showDetails } = this.state;
    const { children, fallback, isolate, useProductionFallback } = this.props;

    if (hasError && error) {
      // Use custom fallback if provided
      if (fallback) {
        return <>{fallback}</>;
      }

      // Use production fallback if specified and not in development
      if (useProductionFallback && import.meta.env.MODE === 'production') {
        return (
          <ProductionErrorFallback 
            error={error}
            resetError={this.resetErrorBoundary}
          />
        );
      }

      // For isolated errors, show a compact error message
      if (isolate) {
        return (
          <Alert variant="destructive" className="m-2">
            <Warning className="h-4 w-4" />
            <AlertTitle>Component Error</AlertTitle>
            <AlertDescription>
              This component encountered an error and cannot be displayed.
              <Button
                variant="link"
                size="sm"
                onClick={this.resetErrorBoundary}
                className="ml-2 p-0"
              >
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        );
      }

      // Full page error fallback
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-2xl w-full">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Warning className="h-6 w-6 text-destructive" />
                <CardTitle>Oops! Something went wrong</CardTitle>
              </div>
              <CardDescription>
                We encountered an unexpected error. The error has been logged and we'll look into it.
                {errorCount >= 3 && (
                  <span className="block mt-2 text-yellow-600">
                    Multiple errors detected. Please refresh the page if the problem persists.
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-2">
                <Button onClick={this.resetErrorBoundary} className="flex items-center gap-2">
                  <ArrowsClockwise className="h-4 w-4" />
                  Try Again
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => window.location.href = '/'}
                  className="flex items-center gap-2"
                >
                  <House className="h-4 w-4" />
                  Go to Home
                </Button>
                <Button
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </Button>
              </div>

              {import.meta.env.MODE === 'development' && (
                <div className="space-y-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={this.toggleDetails}
                    className="flex items-center gap-2"
                  >
                    {showDetails ? <CaretUp className="h-4 w-4" /> : <CaretDown className="h-4 w-4" />}
                    {showDetails ? 'Hide' : 'Show'} Error Details
                  </Button>
                  
                  {showDetails && (
                    <div className="space-y-4">
                      <Alert>
                        <AlertTitle>Error Message</AlertTitle>
                        <AlertDescription className="font-mono text-sm mt-2">
                          {error.message}
                        </AlertDescription>
                      </Alert>
                      
                      {error.stack && (
                        <Alert>
                          <AlertTitle>Stack Trace</AlertTitle>
                          <AlertDescription>
                            <pre className="text-xs overflow-x-auto mt-2 p-2 bg-muted rounded">
                              {error.stack}
                            </pre>
                          </AlertDescription>
                        </Alert>
                      )}
                      
                      {errorInfo && errorInfo.componentStack && (
                        <Alert>
                          <AlertTitle>Component Stack</AlertTitle>
                          <AlertDescription>
                            <pre className="text-xs overflow-x-auto mt-2 p-2 bg-muted rounded">
                              {errorInfo.componentStack}
                            </pre>
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return children;
  }
}

// Specialized error boundary for routes
export class RouteErrorBoundary extends ErrorBoundary {
  constructor(props: Props) {
    super({
      ...props,
      isolate: false,
      resetOnPropsChange: true
    });
  }
}

// Specialized error boundary for isolated components
export class ComponentErrorBoundary extends ErrorBoundary {
  constructor(props: Props) {
    super({
      ...props,
      isolate: true,
      showDetails: false
    });
  }
}

// Hook for error handling (to be used with error boundaries)
export function useErrorHandler() {
  return (error: Error, errorInfo?: ErrorInfo) => {
    console.error('Error caught by useErrorHandler:', error, errorInfo);
    
    // In production, send to error reporting service
    if (import.meta.env.MODE === 'production') {
      // TODO: Implement error reporting
    }
  };
}

// Higher-order component for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

export default ErrorBoundary;