/**
 * Frontend error handling utilities
 */

import { toast } from '@/hooks/use-toast';

export interface ErrorInfo {
  message: string;
  code?: string;
  details?: any;
  userMessage?: string;
}

/**
 * Maps error responses to user-friendly messages
 */
export function getUserFriendlyMessage(error: any): string {
  // Handle different error formats
  const errorMessage = 
    error?.message || 
    error?.error || 
    error?.data?.error ||
    error?.response?.data?.error ||
    error?.toString() || 
    'An unexpected error occurred';

  // Map common errors to user-friendly messages
  const errorMap: Record<string, string> = {
    // Authentication errors
    'unauthorized': 'Please log in to continue.',
    'authentication required': 'Your session has expired. Please log in again.',
    'invalid token': 'Your session is invalid. Please log in again.',
    
    // Credit errors
    'insufficient credits': 'You have insufficient credits. Please add more credits to continue.',
    'credit check failed': 'Unable to verify your credit balance. Please try again.',
    'balance too low': 'Your balance is too low for this action.',
    
    // Agent errors
    'agent not found': 'The agent could not be found. Please refresh and try again.',
    'agent already exists': 'An agent with this name already exists.',
    'agent is locked': 'This agent is currently being used by a campaign and cannot be edited.',
    'deployment failed': 'Failed to deploy the agent. Please check all settings and try again.',
    
    // Phone number errors
    'phone number not found': 'The selected phone number is no longer available.',
    'phone already in use': 'This phone number is already assigned to another agent.',
    'invalid phone number': 'Please enter a valid phone number in E.164 format (e.g., +1234567890).',
    'phone binding failed': 'Failed to assign the phone number. Please try again.',
    
    // Cal.com errors
    'cal.com authentication failed': 'Cal.com integration failed. Please check your API key.',
    'invalid cal.com credentials': 'Your Cal.com credentials are invalid. Please update them in settings.',
    'event type not found': 'The specified Cal.com event type was not found.',
    
    // Network errors
    'network error': 'Connection error. Please check your internet connection.',
    'timeout': 'The request timed out. Please try again.',
    'service unavailable': 'The service is temporarily unavailable. Please try again later.',
    
    // Validation errors
    'validation error': 'Please check your input and try again.',
    'missing required fields': 'Please fill in all required fields.',
    'invalid data format': 'Some of your data is in an invalid format. Please check and try again.',
    
    // Rate limiting
    'rate limit exceeded': 'Too many requests. Please wait a moment and try again.',
    'too many attempts': 'Too many attempts. Please wait before trying again.',
    
    // Retell API errors
    'retell api error': 'Voice service is temporarily unavailable. Please try again later.',
    'voice not available': 'The selected voice is not available. Please choose another.',
    'llm update failed': 'Failed to update agent configuration. Please try again.',
    
    // Campaign errors
    'campaign not found': 'The campaign could not be found.',
    'campaign already active': 'This campaign is already running.',
    'no contacts selected': 'Please select contacts for your campaign.',
    
    // File upload errors
    'file too large': 'The file is too large. Please use a smaller file.',
    'invalid file type': 'Invalid file type. Please use a supported format.',
    'upload failed': 'File upload failed. Please try again.',
  };

  // Check for specific error patterns
  const lowerMessage = errorMessage.toLowerCase();
  
  for (const [pattern, friendlyMessage] of Object.entries(errorMap)) {
    if (lowerMessage.includes(pattern)) {
      return friendlyMessage;
    }
  }

  // Check for HTTP status codes
  if (lowerMessage.includes('401') || lowerMessage.includes('unauthorized')) {
    return 'Please log in to continue.';
  }
  if (lowerMessage.includes('403') || lowerMessage.includes('forbidden')) {
    return 'You don\'t have permission to perform this action.';
  }
  if (lowerMessage.includes('404') || lowerMessage.includes('not found')) {
    return 'The requested resource was not found.';
  }
  if (lowerMessage.includes('429')) {
    return 'Too many requests. Please wait a moment and try again.';
  }
  if (lowerMessage.includes('500') || lowerMessage.includes('internal')) {
    return 'A server error occurred. Please try again later.';
  }

  // Default message
  return 'An error occurred. Please try again.';
}

/**
 * Shows an error toast with a user-friendly message
 */
export function showErrorToast(error: any, context?: string) {
  const message = getUserFriendlyMessage(error);
  const title = context || 'Error';
  
  toast({
    title,
    description: message,
    variant: 'destructive',
    duration: 5000,
  });

  // Log the full error for debugging
  console.error(`[${title}]`, error);
}

/**
 * Handles errors with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    retryDelay?: number;
    onRetry?: (attemptNumber: number, error: any) => void;
    shouldRetry?: (error: any) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    onRetry,
    shouldRetry = (error) => {
      // Don't retry on certain errors
      const message = error?.message?.toLowerCase() || '';
      return !(
        message.includes('unauthorized') ||
        message.includes('forbidden') ||
        message.includes('invalid') ||
        message.includes('not found')
      );
    }
  } = options;

  let lastError: any;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries && shouldRetry(error)) {
        if (onRetry) {
          onRetry(attempt, error);
        }
        
        // Wait before retrying with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }
  
  throw lastError;
}

/**
 * Wraps an async function with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      showErrorToast(error, context);
      throw error;
    }
  }) as T;
}

/**
 * Validates form data and returns errors
 */
export function validateFormData<T extends Record<string, any>>(
  data: T,
  rules: Partial<Record<keyof T, (value: any) => string | undefined>>
): Record<string, string> {
  const errors: Record<string, string> = {};
  
  for (const [field, validator] of Object.entries(rules)) {
    if (validator) {
      const error = (validator as any)(data[field as keyof T]);
      if (error) {
        errors[field] = error;
      }
    }
  }
  
  return errors;
}

/**
 * Common validation rules
 */
export const validators = {
  required: (message = 'This field is required') => 
    (value: any) => !value ? message : undefined,
  
  minLength: (min: number, message?: string) => 
    (value: string) => value && value.length < min 
      ? message || `Must be at least ${min} characters` 
      : undefined,
  
  maxLength: (max: number, message?: string) => 
    (value: string) => value && value.length > max 
      ? message || `Must be no more than ${max} characters` 
      : undefined,
  
  email: (message = 'Invalid email address') => 
    (value: string) => value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) 
      ? message 
      : undefined,
  
  phone: (message = 'Invalid phone number') => 
    (value: string) => value && !/^\+?[1-9]\d{1,14}$/.test(value.replace(/[\s()-]/g, '')) 
      ? message 
      : undefined,
  
  url: (message = 'Invalid URL') => 
    (value: string) => {
      try {
        new URL(value);
        return undefined;
      } catch {
        return message;
      }
    },
  
  number: (min?: number, max?: number) => 
    (value: any) => {
      const num = Number(value);
      if (isNaN(num)) return 'Must be a number';
      if (min !== undefined && num < min) return `Must be at least ${min}`;
      if (max !== undefined && num > max) return `Must be no more than ${max}`;
      return undefined;
    }
};

/**
 * Handles API errors and extracts useful information
 */
export function parseApiError(error: any): ErrorInfo {
  // Handle Supabase function errors
  if (error?.data?.error) {
    return {
      message: error.data.error,
      code: error.data.code,
      details: error.data.details,
      userMessage: getUserFriendlyMessage(error.data)
    };
  }
  
  // Handle standard errors
  if (error?.message) {
    return {
      message: error.message,
      code: error.code,
      userMessage: getUserFriendlyMessage(error)
    };
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    return {
      message: error,
      userMessage: getUserFriendlyMessage(error)
    };
  }
  
  // Unknown error format
  return {
    message: 'Unknown error',
    userMessage: 'An unexpected error occurred. Please try again.'
  };
}