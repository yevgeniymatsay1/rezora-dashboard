// @ts-nocheck
import { useEffect, useRef } from 'react';

/**
 * Form focus management utilities
 */

/**
 * Hook to auto-focus first form field
 */
export function useAutoFocus(delay: number = 100) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        ref.current.select?.();
      }
    }, delay);
    
    return () => clearTimeout(timer);
  }, [delay]);
  
  return ref;
}

/**
 * Focus first error field in form
 */
export function focusFirstError(formElement: HTMLFormElement | null) {
  if (!formElement) return;
  
  // Find first field with aria-invalid="true" or data-error="true"
  const errorField = formElement.querySelector<HTMLElement>(
    '[aria-invalid="true"], [data-error="true"], .error input, .error textarea, .error select'
  );
  
  if (errorField && 'focus' in errorField) {
    errorField.focus();
    
    // Scroll into view if needed
    errorField.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
    
    return true;
  }
  
  return false;
}

/**
 * Hook to focus first error field on validation errors
 */
export function useErrorFocus(errors: Record<string, any>) {
  const formRef = useRef<HTMLFormElement>(null);
  
  useEffect(() => {
    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        if (formRef.current) {
          // Try to focus first error field
          if (!focusFirstError(formRef.current)) {
            // If no error field found, try to focus field by name
            const firstErrorKey = errorKeys[0];
            const field = formRef.current.querySelector<HTMLElement>(
              `[name="${firstErrorKey}"], #${firstErrorKey}`
            );
            
            if (field && 'focus' in field) {
              field.focus();
              field.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
              });
            }
          }
        }
      }, 100);
    }
  }, [errors]);
  
  return formRef;
}

/**
 * Set focus to a specific field by name or id
 */
export function focusField(fieldName: string, formElement?: HTMLFormElement | null) {
  const container = formElement || document;
  const field = container.querySelector<HTMLElement>(
    `[name="${fieldName}"], #${fieldName}`
  );
  
  if (field && 'focus' in field) {
    field.focus();
    field.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
    return true;
  }
  
  return false;
}

/**
 * Hook for managing form focus state
 */
export function useFormFocus(options: {
  autoFocusFirst?: boolean;
  focusOnError?: boolean;
  resetFocusOnSubmit?: boolean;
} = {}) {
  const {
    autoFocusFirst = true,
    focusOnError = true,
    resetFocusOnSubmit = false
  } = options;
  
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLElement | null>(null);
  
  // Auto-focus first field on mount
  useEffect(() => {
    if (autoFocusFirst && formRef.current) {
      const firstField = formRef.current.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
      );
      
      if (firstField && 'focus' in firstField) {
        firstFieldRef.current = firstField;
        setTimeout(() => {
          firstField.focus();
        }, 100);
      }
    }
  }, [autoFocusFirst]);
  
  const handleError = (fieldName?: string) => {
    if (focusOnError && formRef.current) {
      if (fieldName) {
        focusField(fieldName, formRef.current);
      } else {
        focusFirstError(formRef.current);
      }
    }
  };
  
  const resetFocus = () => {
    if (resetFocusOnSubmit && firstFieldRef.current) {
      firstFieldRef.current.focus();
    }
  };
  
  return {
    formRef,
    handleError,
    resetFocus,
    focusField: (name: string) => focusField(name, formRef.current)
  };
}

/**
 * Get the next focusable element in tab order
 */
export function getNextFocusable(
  current: HTMLElement,
  container: HTMLElement = document.body
): HTMLElement | null {
  const focusableElements = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  
  const elements = Array.from(focusableElements);
  const currentIndex = elements.indexOf(current);
  
  if (currentIndex >= 0 && currentIndex < elements.length - 1) {
    return elements[currentIndex + 1];
  }
  
  return null;
}

/**
 * Get the previous focusable element in tab order
 */
export function getPreviousFocusable(
  current: HTMLElement,
  container: HTMLElement = document.body
): HTMLElement | null {
  const focusableElements = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  
  const elements = Array.from(focusableElements);
  const currentIndex = elements.indexOf(current);
  
  if (currentIndex > 0) {
    return elements[currentIndex - 1];
  }
  
  return null;
}