/**
 * Shared error handling utilities for edge functions
 */

export interface ErrorResponse {
  error: string;
  details?: string;
  code?: string;
  userMessage?: string;
}

/**
 * Maps technical errors to user-friendly messages
 */
export function getUserFriendlyError(error: any): ErrorResponse {
  const errorMessage = error?.message || error?.toString() || 'Unknown error';
  
  // Map common errors to user-friendly messages
  const errorMappings: Record<string, string> = {
    'Missing required fields': 'Please fill in all required fields and try again.',
    'Invalid phone number': 'Please enter a valid phone number in E.164 format (e.g., +1234567890).',
    'Agent not found': 'The agent could not be found. Please refresh and try again.',
    'Unauthorized': 'You are not authorized to perform this action. Please log in again.',
    'Insufficient credits': 'You have insufficient credits. Please add more credits to continue.',
    'Rate limit exceeded': 'Too many requests. Please wait a moment and try again.',
    'Network error': 'Connection error. Please check your internet and try again.',
    'Retell API error': 'Voice service is temporarily unavailable. Please try again later.',
    'Invalid API key': 'Your API key is invalid or expired. Please check your settings.',
    'Webhook signature': 'Security verification failed. Please contact support.',
    'Database error': 'Unable to save your changes. Please try again.',
    'Validation error': 'Some information is invalid. Please check your inputs.',
    'Phone number already in use': 'This phone number is already assigned to another agent.',
    'Cal.com authentication failed': 'Cal.com integration failed. Please check your API key.',
    'Template not found': 'The selected template is no longer available.',
    'Deployment failed': 'Agent deployment failed. Please check all settings and try again.',
    'Update failed': 'Unable to update agent. Please try again.',
  };

  // Check for specific error patterns
  let userMessage = 'An unexpected error occurred. Please try again.';
  let code = 'UNKNOWN_ERROR';
  
  // Check for Retell API errors
  if (errorMessage.includes('Retell') || errorMessage.includes('retell')) {
    userMessage = 'Voice service error. Please try again in a few moments.';
    code = 'RETELL_API_ERROR';
  }
  // Check for authentication errors
  else if (errorMessage.includes('401') || errorMessage.includes('unauthorized') || errorMessage.includes('Unauthorized')) {
    userMessage = 'Authentication failed. Please log in again.';
    code = 'AUTH_ERROR';
  }
  // Check for validation errors
  else if (errorMessage.includes('400') || errorMessage.includes('validation') || errorMessage.includes('invalid')) {
    userMessage = 'Please check your information and try again.';
    code = 'VALIDATION_ERROR';
  }
  // Check for network errors
  else if (errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('ECONNREFUSED')) {
    userMessage = 'Connection error. Please check your internet connection.';
    code = 'NETWORK_ERROR';
  }
  // Check for rate limiting
  else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
    userMessage = 'Too many requests. Please wait a moment and try again.';
    code = 'RATE_LIMIT';
  }
  // Check for credit issues
  else if (errorMessage.includes('credit') || errorMessage.includes('balance')) {
    userMessage = 'Credit issue detected. Please check your balance.';
    code = 'CREDIT_ERROR';
  }
  // Check for phone number issues
  else if (errorMessage.includes('phone')) {
    userMessage = 'Phone number issue. Please verify the number and try again.';
    code = 'PHONE_ERROR';
  }
  // Check for Cal.com issues
  else if (errorMessage.includes('Cal.com') || errorMessage.includes('cal.com')) {
    userMessage = 'Calendar integration error. Please check your Cal.com settings.';
    code = 'CALCOM_ERROR';
  }
  // Check for database errors
  else if (errorMessage.includes('database') || errorMessage.includes('supabase') || errorMessage.includes('postgres')) {
    userMessage = 'Unable to save changes. Please try again.';
    code = 'DATABASE_ERROR';
  }
  
  // Check against known error mappings
  for (const [pattern, message] of Object.entries(errorMappings)) {
    if (errorMessage.toLowerCase().includes(pattern.toLowerCase())) {
      userMessage = message;
      break;
    }
  }

  return {
    error: userMessage,
    details: errorMessage,
    code,
    userMessage
  };
}

/**
 * Logs error with context for debugging
 */
export function logError(context: string, error: any, additionalInfo?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    context,
    error: error?.message || error?.toString() || 'Unknown error',
    stack: error?.stack,
    ...additionalInfo
  };
  
  console.error(`[ERROR] ${context}:`, JSON.stringify(errorInfo, null, 2));
}

/**
 * Validates required fields are present
 */
export function validateRequiredFields(data: Record<string, any>, requiredFields: string[]): string | null {
  const missingFields = requiredFields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });
  
  if (missingFields.length > 0) {
    return `Missing required fields: ${missingFields.join(', ')}`;
  }
  
  return null;
}

/**
 * Safely parses JSON with error handling
 */
export function safeJsonParse<T = any>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch (error) {
    logError('JSON_PARSE_ERROR', error, { json: json.substring(0, 200) });
    return fallback;
  }
}

/**
 * Wraps async functions with error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context: string,
  fallbackValue?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    logError(context, error);
    if (fallbackValue !== undefined) {
      return fallbackValue;
    }
    throw error;
  }
}

/**
 * Retries a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on certain errors
      const errorMessage = error?.message || '';
      if (
        errorMessage.includes('401') ||
        errorMessage.includes('403') ||
        errorMessage.includes('Invalid API key') ||
        errorMessage.includes('Insufficient credits')
      ) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delay = initialDelay * Math.pow(2, i);
      
      if (i < maxRetries - 1) {
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(error: any, statusCode: number = 500, corsHeaders: Record<string, string> = {}): Response {
  const errorResponse = getUserFriendlyError(error);
  
  return new Response(JSON.stringify(errorResponse), {
    status: statusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}