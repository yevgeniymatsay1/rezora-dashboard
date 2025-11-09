import { PostgrestError } from '@supabase/supabase-js';

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Custom error class for database errors
 */
export class DatabaseError extends AppError {
  constructor(error: PostgrestError) {
    super(error.message, error.code, error.details);
    this.name = 'DatabaseError';
  }
}

/**
 * Base service utilities for all services
 */
export const baseService = {
  /**
   * Handle Supabase response and throw on error
   */
  handleResponse<T>(response: { data: T | null; error: PostgrestError | null }): T {
    if (response.error) {
      throw new DatabaseError(response.error);
    }
    
    if (!response.data) {
      throw new AppError('No data returned from database');
    }
    
    return response.data;
  },

  /**
   * Handle Supabase response that might return null
   */
  handleOptionalResponse<T>(response: { data: T | null; error: PostgrestError | null }): T | null {
    if (response.error) {
      throw new DatabaseError(response.error);
    }
    
    return response.data;
  },

  /**
   * Handle mutations (insert, update, delete) where we don't expect data back
   */
  handleMutation(response: { error: PostgrestError | null }): void {
    if (response.error) {
      throw new DatabaseError(response.error);
    }
  },

  /**
   * Retry an operation with exponential backoff
   */
  async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry auth errors
        if (error instanceof AppError && error.code?.includes('AUTH')) {
          throw error;
        }
        
        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new AppError('Operation failed after retries');
  },

  /**
   * Build a consistent error message for user display
   */
  getUserErrorMessage(error: unknown): string {
    if (error instanceof AppError || error instanceof DatabaseError) {
      return error.message;
    }
    
    if (error instanceof Error) {
      return error.message;
    }
    
    return 'An unexpected error occurred. Please try again.';
  }
};