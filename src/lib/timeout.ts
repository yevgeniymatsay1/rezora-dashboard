/**
 * Timeout utilities for handling long-running operations
 */

/**
 * Default timeout values for different operation types (in milliseconds)
 */
export const TIMEOUT_DURATIONS = {
  SHORT: 5000,    // 5 seconds for quick operations
  MEDIUM: 15000,  // 15 seconds for standard operations
  LONG: 30000,    // 30 seconds for complex operations
  API: 10000,     // 10 seconds for API calls
  UPLOAD: 60000,  // 60 seconds for file uploads
} as const;

/**
 * Error class for timeout errors
 */
export class TimeoutError extends Error {
  constructor(message = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Wraps a promise with a timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = TIMEOUT_DURATIONS.MEDIUM,
  errorMessage?: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(errorMessage || `Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Retries an operation with timeout
 */
export async function retryWithTimeout<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    timeoutMs?: number;
    retryDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    timeoutMs = TIMEOUT_DURATIONS.MEDIUM,
    retryDelay = 1000,
    onRetry
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(operation(), timeoutMs);
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        onRetry?.(attempt, lastError);
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }
  }

  throw lastError!;
}

/**
 * Hook for timeout handling in React components
 */
import { useCallback, useRef, useEffect } from 'react';

export function useTimeout(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);
  const timeoutId = useRef<NodeJS.Timeout>();

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const set = useCallback(() => {
    if (delay !== null) {
      timeoutId.current = setTimeout(() => savedCallback.current(), delay);
    }
  }, [delay]);

  const clear = useCallback(() => {
    if (timeoutId.current) {
      clearTimeout(timeoutId.current);
    }
  }, []);

  useEffect(() => {
    set();
    return clear;
  }, [delay, set, clear]);

  return { set, clear };
}

/**
 * Hook for async operations with timeout
 */
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export function useAsyncWithTimeout() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { toast } = useToast();

  const execute = useCallback(async <T,>(
    operation: () => Promise<T>,
    options: {
      timeoutMs?: number;
      successMessage?: string;
      errorMessage?: string;
      showToast?: boolean;
    } = {}
  ): Promise<T | null> => {
    const {
      timeoutMs = TIMEOUT_DURATIONS.MEDIUM,
      successMessage,
      errorMessage,
      showToast = true
    } = options;

    setIsLoading(true);
    setError(null);

    try {
      const result = await withTimeout(operation(), timeoutMs);
      
      if (showToast && successMessage) {
        toast({
          title: "Success",
          description: successMessage,
        });
      }
      
      return result;
    } catch (err) {
      const error = err as Error;
      setError(error);
      
      if (showToast) {
        toast({
          title: error instanceof TimeoutError ? "Operation Timed Out" : "Error",
          description: errorMessage || error.message,
          variant: "destructive",
        });
      }
      
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  return { execute, isLoading, error };
}