import React, { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { 
  CheckCircle, 
  WarningCircle, 
  Info, 
  Warning,
  X,
  CircleNotch
} from '@phosphor-icons/react';

type FeedbackType = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface FormFeedbackProps {
  type?: FeedbackType;
  title?: string;
  message?: string;
  messages?: string[];
  dismissible?: boolean;
  onDismiss?: () => void;
  autoHide?: boolean;
  autoHideDelay?: number;
  showProgress?: boolean;
  className?: string;
  compact?: boolean;
}

export function FormFeedback({
  type = 'info',
  title,
  message,
  messages,
  dismissible = true,
  onDismiss,
  autoHide = false,
  autoHideDelay = 5000,
  showProgress = false,
  className,
  compact = false
}: FormFeedbackProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (autoHide && isVisible) {
      const interval = showProgress ? 100 : autoHideDelay;
      const decrement = showProgress ? (100 / (autoHideDelay / 100)) : 0;
      
      const timer = setInterval(() => {
        if (showProgress) {
          setProgress(prev => {
            const newValue = prev - decrement;
            if (newValue <= 0) {
              handleDismiss();
              return 0;
            }
            return newValue;
          });
        }
      }, interval);
      
      const hideTimer = setTimeout(() => {
        handleDismiss();
      }, autoHideDelay);
      
      return () => {
        clearInterval(timer);
        clearTimeout(hideTimer);
      };
    }
  }, [autoHide, autoHideDelay, showProgress, isVisible]);

  const handleDismiss = () => {
    setIsVisible(false);
    onDismiss?.();
  };

  if (!isVisible) return null;

  const icons = {
    success: <CheckCircle className="h-4 w-4" />,
    error: <WarningCircle className="h-4 w-4" />,
    warning: <Warning className="h-4 w-4" />,
    info: <Info className="h-4 w-4" />,
    loading: <CircleNotch className="h-4 w-4 animate-spin" />
  };

  const variants = {
    success: 'border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100',
    error: 'border-destructive bg-destructive/10 text-destructive',
    warning: 'border-yellow-500 bg-yellow-50 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100',
    info: 'border-blue-500 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
    loading: 'border-muted bg-muted/50'
  };

  const icon = icons[type];
  const variant = variants[type];

  if (compact) {
    return (
      <div className={cn(
        'flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
        variant,
        'animate-in fade-in-0 slide-in-from-top-2',
        className
      )}>
        {icon}
        <span className="flex-1">{message || title}</span>
        {dismissible && type !== 'loading' && (
          <button
            onClick={handleDismiss}
            className="ml-2 opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <Alert className={cn(
      variant,
      'relative animate-in fade-in-0 slide-in-from-top-2',
      className
    )}>
      {icon}
      {title && <AlertTitle>{title}</AlertTitle>}
      {(message || messages) && (
        <AlertDescription className={title ? 'mt-2' : ''}>
          {message}
          {messages && (
            <ul className="mt-2 list-disc list-inside space-y-1">
              {messages.map((msg, index) => (
                <li key={index}>{msg}</li>
              ))}
            </ul>
          )}
        </AlertDescription>
      )}
      {dismissible && type !== 'loading' && (
        <button
          onClick={handleDismiss}
          className="absolute right-2 top-2 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {showProgress && autoHide && (
        <Progress 
          value={progress} 
          className="absolute bottom-0 left-0 right-0 h-1 rounded-b-md"
        />
      )}
    </Alert>
  );
}

// Inline feedback for form fields
export function InlineFormFeedback({
  type,
  message,
  className
}: {
  type: FeedbackType;
  message: string;
  className?: string;
}) {
  const colors = {
    success: 'text-green-600',
    error: 'text-destructive',
    warning: 'text-yellow-600',
    info: 'text-blue-600',
    loading: 'text-muted-foreground'
  };

  const icons = {
    success: <CheckCircle className="h-3 w-3" />,
    error: <WarningCircle className="h-3 w-3" />,
    warning: <Warning className="h-3 w-3" />,
    info: <Info className="h-3 w-3" />,
    loading: <CircleNotch className="h-3 w-3 animate-spin" />
  };

  return (
    <div className={cn(
      'flex items-center gap-1 text-sm mt-1',
      colors[type],
      'animate-in fade-in-0 slide-in-from-top-1',
      className
    )}>
      {icons[type]}
      <span>{message}</span>
    </div>
  );
}

// Form submission feedback overlay
export function FormSubmissionOverlay({
  isSubmitting,
  isSuccess,
  isError,
  message,
  onClose
}: {
  isSubmitting?: boolean;
  isSuccess?: boolean;
  isError?: boolean;
  message?: string;
  onClose?: () => void;
}) {
  if (!isSubmitting && !isSuccess && !isError) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card p-6 rounded-lg shadow-lg max-w-sm w-full mx-4 animate-in zoom-in-95">
        {isSubmitting && (
          <div className="text-center">
            <CircleNotch className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-lg font-medium">{message || 'Processing...'}</p>
            <p className="text-sm text-muted-foreground mt-2">Please wait</p>
          </div>
        )}
        
        {isSuccess && (
          <div className="text-center">
            <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600" />
            <p className="text-lg font-medium">{message || 'Success!'}</p>
            {onClose && (
              <Button
                onClick={onClose}
                className="mt-4"
                variant="outline"
              >
                Continue
              </Button>
            )}
          </div>
        )}
        
        {isError && (
          <div className="text-center">
            <WarningCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <p className="text-lg font-medium">{message || 'An error occurred'}</p>
            {onClose && (
              <Button
                onClick={onClose}
                className="mt-4"
                variant="outline"
              >
                Try Again
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}