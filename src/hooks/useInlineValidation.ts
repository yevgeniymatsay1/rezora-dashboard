import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Hook for inline form validation with debouncing
 */

interface ValidationRule {
  validate: (value: any) => boolean;
  message: string;
}

interface FieldValidation {
  rules: ValidationRule[];
  validateOnBlur?: boolean;
  validateOnChange?: boolean;
  debounceMs?: number;
}

interface ValidationState {
  [field: string]: {
    error: string | null;
    isValidating: boolean;
    touched: boolean;
  };
}

export function useInlineValidation(
  validations: Record<string, FieldValidation>
) {
  const [validationState, setValidationState] = useState<ValidationState>({});
  const [isFormValid, setIsFormValid] = useState(false);
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // Initialize validation state
  useEffect(() => {
    const initialState: ValidationState = {};
    Object.keys(validations).forEach(field => {
      initialState[field] = {
        error: null,
        isValidating: false,
        touched: false,
      };
    });
    setValidationState(initialState);
  }, [validations]);

  // Check if entire form is valid
  useEffect(() => {
    const allFieldsValid = Object.values(validationState).every(
      field => !field.error && field.touched
    );
    setIsFormValid(allFieldsValid);
  }, [validationState]);

  const validateField = useCallback(
    (fieldName: string, value: any): string | null => {
      const fieldValidation = validations[fieldName];
      if (!fieldValidation) return null;

      for (const rule of fieldValidation.rules) {
        if (!rule.validate(value)) {
          return rule.message;
        }
      }
      return null;
    },
    [validations]
  );

  const handleFieldChange = useCallback(
    (fieldName: string, value: any) => {
      const fieldValidation = validations[fieldName];
      if (!fieldValidation?.validateOnChange) return;

      // Clear existing debounce timer
      if (debounceTimers.current[fieldName]) {
        clearTimeout(debounceTimers.current[fieldName]);
      }

      // Set validating state
      setValidationState(prev => ({
        ...prev,
        [fieldName]: {
          ...prev[fieldName],
          isValidating: true,
        },
      }));

      // Debounce validation
      const debounceMs = fieldValidation.debounceMs || 300;
      debounceTimers.current[fieldName] = setTimeout(() => {
        const error = validateField(fieldName, value);
        setValidationState(prev => ({
          ...prev,
          [fieldName]: {
            error,
            isValidating: false,
            touched: true,
          },
        }));
      }, debounceMs);
    },
    [validations, validateField]
  );

  const handleFieldBlur = useCallback(
    (fieldName: string, value: any) => {
      const fieldValidation = validations[fieldName];
      if (!fieldValidation?.validateOnBlur) return;

      const error = validateField(fieldName, value);
      setValidationState(prev => ({
        ...prev,
        [fieldName]: {
          error,
          isValidating: false,
          touched: true,
        },
      }));
    },
    [validations, validateField]
  );

  const validateAllFields = useCallback(
    (values: Record<string, any>): boolean => {
      const newState: ValidationState = {};
      let hasErrors = false;

      Object.keys(validations).forEach(fieldName => {
        const error = validateField(fieldName, values[fieldName]);
        if (error) hasErrors = true;
        
        newState[fieldName] = {
          error,
          isValidating: false,
          touched: true,
        };
      });

      setValidationState(newState);
      return !hasErrors;
    },
    [validations, validateField]
  );

  const clearValidation = useCallback(
    (fieldName?: string) => {
      if (fieldName) {
        setValidationState(prev => ({
          ...prev,
          [fieldName]: {
            error: null,
            isValidating: false,
            touched: false,
          },
        }));
      } else {
        const clearedState: ValidationState = {};
        Object.keys(validations).forEach(field => {
          clearedState[field] = {
            error: null,
            isValidating: false,
            touched: false,
          };
        });
        setValidationState(clearedState);
      }
    },
    [validations]
  );

  // Cleanup debounce timers
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(timer => {
        clearTimeout(timer);
      });
    };
  }, []);

  return {
    validationState,
    isFormValid,
    handleFieldChange,
    handleFieldBlur,
    validateAllFields,
    validateField,
    clearValidation,
    getFieldError: (fieldName: string) => validationState[fieldName]?.error,
    isFieldValidating: (fieldName: string) => validationState[fieldName]?.isValidating,
    isFieldTouched: (fieldName: string) => validationState[fieldName]?.touched,
  };
}

/**
 * Common validation rules
 */
export const validationRules = {
  required: (message = 'This field is required'): ValidationRule => ({
    validate: (value) => {
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return value != null && value !== '';
    },
    message,
  }),

  email: (message = 'Please enter a valid email'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true; // Allow empty for optional fields
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    },
    message,
  }),

  phone: (message = 'Please enter a valid phone number'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true; // Allow empty for optional fields
      const phoneRegex = /^\+?[\d\s-()]+$/;
      return phoneRegex.test(value) && value.replace(/\D/g, '').length >= 10;
    },
    message,
  }),

  minLength: (min: number, message?: string): ValidationRule => ({
    validate: (value) => {
      if (!value) return true; // Allow empty for optional fields
      return value.length >= min;
    },
    message: message || `Must be at least ${min} characters`,
  }),

  maxLength: (max: number, message?: string): ValidationRule => ({
    validate: (value) => {
      if (!value) return true; // Allow empty for optional fields
      return value.length <= max;
    },
    message: message || `Must be no more than ${max} characters`,
  }),

  pattern: (regex: RegExp, message: string): ValidationRule => ({
    validate: (value) => {
      if (!value) return true; // Allow empty for optional fields
      return regex.test(value);
    },
    message,
  }),

  number: (message = 'Must be a valid number'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true; // Allow empty for optional fields
      return !isNaN(Number(value));
    },
    message,
  }),

  min: (min: number, message?: string): ValidationRule => ({
    validate: (value) => {
      if (!value) return true; // Allow empty for optional fields
      return Number(value) >= min;
    },
    message: message || `Must be at least ${min}`,
  }),

  max: (max: number, message?: string): ValidationRule => ({
    validate: (value) => {
      if (!value) return true; // Allow empty for optional fields
      return Number(value) <= max;
    },
    message: message || `Must be no more than ${max}`,
  }),

  url: (message = 'Please enter a valid URL'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true; // Allow empty for optional fields
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    },
    message,
  }),

  password: (message = 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number'): ValidationRule => ({
    validate: (value) => {
      if (!value) return true; // Allow empty for optional fields
      return (
        value.length >= 8 &&
        /[A-Z]/.test(value) &&
        /[a-z]/.test(value) &&
        /\d/.test(value)
      );
    },
    message,
  }),

  match: (otherValue: any, message = 'Values do not match'): ValidationRule => ({
    validate: (value) => value === otherValue,
    message,
  }),
};