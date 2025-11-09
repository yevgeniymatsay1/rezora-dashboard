// Utility to parse Retell API errors and provide user-friendly messages

interface RetellError {
  message?: string;
  error?: string;
  details?: string;
  code?: string;
}

export function parseRetellError(errorText: string, operation: string): string {
  try {
    const error: RetellError = JSON.parse(errorText);
    
    // Cal.com related errors - Check these FIRST for priority
    if (errorText.includes('Cal Event Type API') || 
        errorText.includes('cal.com') || 
        errorText.includes('cal_api_key') || 
        errorText.includes('event_type_id') ||
        errorText.includes('Event Type API') ||
        (errorText.includes('403') && errorText.includes('Forbidden') && errorText.includes('cal'))) {
      
      // Specific Cal.com Event Type ID errors
      if (errorText.includes('Cal Event Type API') || 
          errorText.includes('Event Type API') ||
          (errorText.includes('403') && errorText.includes('Forbidden'))) {
        return 'The Cal.com Event Type ID you entered doesn\'t exist or you don\'t have access to it. Please check your Cal.com dashboard and verify the correct Event Type ID.';
      }
      
      // Cal.com API key errors
      if (errorText.includes('unauthorized') || errorText.includes('invalid') || errorText.includes('api_key')) {
        return 'The Cal.com API key is invalid. Please check your Cal.com API key in the integrations settings.';
      }
      
      // Generic Cal.com event type errors
      if (errorText.includes('event_type') || errorText.includes('not found')) {
        return 'The Cal.com Event Type ID you entered doesn\'t exist. Please verify the Event Type ID exists in your Cal.com account.';
      }
      
      // Fallback for any other Cal.com errors
      return 'Cal.com integration error. Please verify your Cal.com API key and Event Type ID in the integrations settings.';
    }

    // Phone number related errors
    if (errorText.includes('phone') || errorText.includes('number')) {
      if (errorText.includes('not found') || errorText.includes('Not Found')) {
        return 'Phone number not found in Retell. Please try syncing your phone numbers or contact support.';
      }
      if (errorText.includes('already')) {
        return 'Phone number is already being used by another agent. Please select a different phone number.';
      }
    }

    // Agent/LLM related errors
    if (errorText.includes('agent') || errorText.includes('llm')) {
      if (errorText.includes('not found') || errorText.includes('Not Found')) {
        return 'Agent configuration not found. Please try creating the agent again.';
      }
      if (errorText.includes('invalid')) {
        return 'Invalid agent configuration. Please check your settings and try again.';
      }
    }

    // API key related errors
    if (errorText.includes('unauthorized') || errorText.includes('Unauthorized') || errorText.includes('invalid key')) {
      return 'Invalid Retell API key. Please check your API key configuration.';
    }

    // Voice related errors
    if (errorText.includes('voice')) {
      return 'Invalid voice configuration. Please check your voice settings.';
    }

    // General validation errors
    if (errorText.includes('validation') || errorText.includes('required')) {
      return `Invalid configuration for ${operation}. Please check all required fields are filled correctly.`;
    }

    // Rate limiting
    if (errorText.includes('rate limit') || errorText.includes('too many')) {
      return 'Rate limit exceeded. Please wait a moment and try again.';
    }

    // Default to the original error if we have a message
    if (error.message) {
      return `${operation} failed: ${error.message}`;
    }
    if (error.error) {
      return `${operation} failed: ${error.error}`;
    }

    // Fallback to generic message with hint about the issue
    return `${operation} failed. Please check your configuration and try again.`;

  } catch (parseError) {
    // If we can't parse the error, return a generic message
    console.error('Failed to parse Retell error:', parseError);
    return `${operation} failed. Please check your configuration and try again.`;
  }
}

// Validate Cal.com credentials format
export function validateCalComCredentials(apiKey?: string, eventTypeId?: string | number): string | null {
  if (!apiKey || !eventTypeId) {
    return null; // Not enabled, no validation needed
  }

  // Basic API key format validation
  if (typeof apiKey !== 'string' || apiKey.length < 10) {
    return 'Cal.com API key appears to be invalid. Please check the format.';
  }

  // Event type ID validation
  const numericEventId = typeof eventTypeId === 'string' ? parseInt(eventTypeId) : Number(eventTypeId);
  if (isNaN(numericEventId) || numericEventId <= 0) {
    return 'Cal.com event type ID must be a valid positive number.';
  }

  return null; // Valid
}

// Helper to check if error indicates Cal.com issues specifically
export function isCalComError(errorText: string): boolean {
  return errorText.includes('cal.com') || 
         errorText.includes('cal_api_key') || 
         errorText.includes('event_type_id') ||
         errorText.includes('calendar');
}