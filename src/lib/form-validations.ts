// Common form validation functions with user-friendly error messages

export const validations = {
  required: (message = 'This field is required') => 
    (value: string) => {
      if (!value || value.trim().length === 0) {
        return message;
      }
      return undefined;
    },

  email: (message = 'Please enter a valid email address') =>
    (value: string) => {
      if (!value) return undefined; // Let required handle empty values
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return message;
      }
      return undefined;
    },

  phone: (message = 'Please enter a valid phone number (10+ digits)') =>
    (value: string) => {
      if (!value) return undefined;
      const digitsOnly = value.replace(/\D/g, '');
      if (digitsOnly.length < 10) {
        return message;
      }
      return undefined;
    },

  minLength: (min: number, message?: string) =>
    (value: string) => {
      if (!value) return undefined;
      if (value.length < min) {
        return message || `Must be at least ${min} characters`;
      }
      return undefined;
    },

  maxLength: (max: number, message?: string) =>
    (value: string) => {
      if (!value) return undefined;
      if (value.length > max) {
        return message || `Must be no more than ${max} characters`;
      }
      return undefined;
    },

  pattern: (pattern: RegExp, message: string) =>
    (value: string) => {
      if (!value) return undefined;
      if (!pattern.test(value)) {
        return message;
      }
      return undefined;
    },

  url: (message = 'Please enter a valid URL') =>
    (value: string) => {
      if (!value) return undefined;
      try {
        new URL(value);
        return undefined;
      } catch {
        return message;
      }
    },

  number: (message = 'Please enter a valid number') =>
    (value: string) => {
      if (!value) return undefined;
      if (isNaN(Number(value))) {
        return message;
      }
      return undefined;
    },

  min: (min: number, message?: string) =>
    (value: string) => {
      if (!value) return undefined;
      const num = Number(value);
      if (isNaN(num) || num < min) {
        return message || `Must be at least ${min}`;
      }
      return undefined;
    },

  max: (max: number, message?: string) =>
    (value: string) => {
      if (!value) return undefined;
      const num = Number(value);
      if (isNaN(num) || num > max) {
        return message || `Must be no more than ${max}`;
      }
      return undefined;
    },

  password: (message = 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number') =>
    (value: string) => {
      if (!value) return undefined;
      if (value.length < 8) {
        return 'Password must be at least 8 characters';
      }
      if (!/[A-Z]/.test(value)) {
        return 'Password must contain at least one uppercase letter';
      }
      if (!/[a-z]/.test(value)) {
        return 'Password must contain at least one lowercase letter';
      }
      if (!/[0-9]/.test(value)) {
        return 'Password must contain at least one number';
      }
      return undefined;
    },

  confirmPassword: (password: string, message = 'Passwords do not match') =>
    (value: string) => {
      if (!value) return undefined;
      if (value !== password) {
        return message;
      }
      return undefined;
    },

  // Combine multiple validators
  combine: (...validators: ((value: string) => string | undefined)[]) =>
    (value: string) => {
      for (const validator of validators) {
        const error = validator(value);
        if (error) return error;
      }
      return undefined;
    }
};

// Helper to create custom validation with async support
export function createAsyncValidator(
  validator: (value: string) => Promise<string | undefined>
) {
  let abortController: AbortController | null = null;
  
  return async (value: string) => {
    // Cancel previous validation if still running
    if (abortController) {
      abortController.abort();
    }
    
    abortController = new AbortController();
    
    try {
      const result = await validator(value);
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return undefined;
      }
      throw error;
    }
  };
}

// Form-level validation helper
export function validateForm<T extends Record<string, any>>(
  values: T,
  validators: Partial<Record<keyof T, (value: any) => string | undefined>>
): Partial<Record<keyof T, string>> {
  const errors: Partial<Record<keyof T, string>> = {};
  
  for (const [field, validator] of Object.entries(validators) as [keyof T, (value: any) => string | undefined][]) {
    if (validator) {
      const error = validator(values[field]);
      if (error) {
        errors[field] = error;
      }
    }
  }
  
  return errors;
}

// Check if form has any errors
export function hasFormErrors(errors: Record<string, string | undefined>): boolean {
  return Object.values(errors).some(error => error !== undefined);
}