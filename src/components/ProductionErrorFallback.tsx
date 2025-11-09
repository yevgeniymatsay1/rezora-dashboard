import { Warning, ArrowsClockwise } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

interface ProductionErrorFallbackProps {
  error?: Error;
  resetError?: () => void;
}

export function ProductionErrorFallback({ error, resetError }: ProductionErrorFallbackProps) {
  const isDevelopment = import.meta.env.MODE === 'development';

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
          <Warning className="w-8 h-8 text-destructive" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground">
            We encountered an unexpected error. Please try refreshing the page.
          </p>
        </div>

        {isDevelopment && error && (
          <div className="bg-muted p-4 rounded-lg text-left">
            <h3 className="font-medium text-sm mb-2">Error Details (Development):</h3>
            <pre className="text-xs text-muted-foreground overflow-auto max-h-32">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {resetError && (
            <Button
              onClick={resetError}
              variant="outline"
              className="flex items-center gap-2"
            >
              <ArrowsClockwise className="w-4 h-4" />
              Try Again
            </Button>
          )}
          
          <Button
            onClick={handleReload}
            className="flex items-center gap-2"
          >
            <ArrowsClockwise className="w-4 h-4" />
            Reload Page
          </Button>
        </div>

        <div className="text-xs text-muted-foreground">
          If this problem persists, please contact support.
        </div>
      </div>
    </div>
  );
}