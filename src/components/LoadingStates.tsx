import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { CircleNotch, ArrowsClockwise } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Spinner loading component
export function Spinner({ 
  size = 'default', 
  className 
}: { 
  size?: 'sm' | 'default' | 'lg'; 
  className?: string;
}) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    default: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <CircleNotch className={cn('animate-spin', sizeClasses[size], className)} />
  );
}

// Full page loading
export function PageLoader({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <Spinner size="lg" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

// Section loading
export function SectionLoader({ 
  message = 'Loading...',
  className 
}: { 
  message?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-center py-12', className)}>
      <div className="text-center space-y-4">
        <Spinner />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

// Card skeleton
export function CardSkeleton({ 
  showHeader = true,
  lines = 3 
}: { 
  showHeader?: boolean;
  lines?: number;
}) {
  return (
    <Card>
      {showHeader && (
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48 mt-2" />
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

// Table skeleton
export function TableSkeleton({ 
  rows = 5, 
  columns = 4 
}: { 
  rows?: number; 
  columns?: number;
}) {
  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex gap-4 p-4 border-b">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-4 border-b">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// List skeleton
export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Form skeleton
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

// Button with loading state
export function LoadingButton({
  isLoading,
  loadingText = 'Loading...',
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & {
  isLoading?: boolean;
  loadingText?: string;
}) {
  return (
    <Button disabled={isLoading || disabled} {...props}>
      {isLoading ? (
        <>
          <Spinner size="sm" className="mr-2" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

// Error state with retry
export function ErrorState({
  title = 'Something went wrong',
  message = 'An error occurred while loading the data.',
  onRetry,
  showRetry = true,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  showRetry?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
      </div>
      {showRetry && onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm">
          <ArrowsClockwise className="h-4 w-4 mr-2" />
          Retry
        </Button>
      )}
    </div>
  );
}

// Empty state
export function EmptyState({
  icon: Icon,
  title,
  message,
  action,
}: {
  icon?: React.ElementType;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      {Icon && <Icon className="h-12 w-12 text-muted-foreground" />}
      <div className="text-center space-y-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {message && (
          <p className="text-sm text-muted-foreground max-w-sm">{message}</p>
        )}
      </div>
      {action}
    </div>
  );
}

// Async component wrapper
export function AsyncBoundary({
  isLoading,
  error,
  onRetry,
  loadingComponent,
  errorComponent,
  emptyComponent,
  isEmpty,
  children,
}: {
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  loadingComponent?: React.ReactNode;
  errorComponent?: React.ReactNode;
  emptyComponent?: React.ReactNode;
  isEmpty?: boolean;
  children: React.ReactNode;
}) {
  if (isLoading) {
    return <>{loadingComponent || <SectionLoader />}</>;
  }

  if (error) {
    return (
      <>
        {errorComponent || (
          <ErrorState
            message={error.message}
            onRetry={onRetry}
            showRetry={!!onRetry}
          />
        )}
      </>
    );
  }

  if (isEmpty && emptyComponent) {
    return <>{emptyComponent}</>;
  }

  return <>{children}</>;
}

// Progress indicator
export function ProgressIndicator({
  value,
  max = 100,
  showLabel = true,
  className,
}: {
  value: number;
  max?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={cn('space-y-2', className)}>
      {showLabel && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium">{Math.round(percentage)}%</span>
        </div>
      )}
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// Skeleton text
export function SkeletonText({
  lines = 1,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'
          )}
        />
      ))}
    </div>
  );
}

// Avatar skeleton
export function AvatarSkeleton({
  size = 'default',
}: {
  size?: 'sm' | 'default' | 'lg';
}) {
  const sizeClasses = {
    sm: 'h-8 w-8',
    default: 'h-10 w-10',
    lg: 'h-12 w-12',
  };

  return <Skeleton className={cn('rounded-full', sizeClasses[size])} />;
}

// Export all components
export default {
  Spinner,
  PageLoader,
  SectionLoader,
  CardSkeleton,
  TableSkeleton,
  ListSkeleton,
  FormSkeleton,
  LoadingButton,
  ErrorState,
  EmptyState,
  AsyncBoundary,
  ProgressIndicator,
  SkeletonText,
  AvatarSkeleton,
};