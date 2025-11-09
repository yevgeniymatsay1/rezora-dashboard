// @ts-nocheck
import { useCallback, useMemo } from 'react';

/**
 * Custom hooks for common callback patterns to prevent function recreation
 */

/**
 * Creates a memoized input change handler
 */
export function useInputHandler<T extends Record<string, any>>(
  setState: React.Dispatch<React.SetStateAction<T>>,
  field?: keyof T
) {
  return useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const { name, value } = e.target;
      const fieldName = field || name;
      
      if (!fieldName) {
        console.warn('useInputHandler: No field name provided');
        return;
      }
      
      setState((prev) => ({
        ...prev,
        [fieldName]: value,
      }));
    },
    [setState, field]
  );
}

/**
 * Creates a memoized checkbox change handler
 */
export function useCheckboxHandler<T extends Record<string, any>>(
  setState: React.Dispatch<React.SetStateAction<T>>,
  field?: keyof T
) {
  return useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, checked } = e.target;
      const fieldName = field || name;
      
      if (!fieldName) {
        console.warn('useCheckboxHandler: No field name provided');
        return;
      }
      
      setState((prev) => ({
        ...prev,
        [fieldName]: checked,
      }));
    },
    [setState, field]
  );
}

/**
 * Creates a memoized select handler
 */
export function useSelectHandler<T extends Record<string, any>>(
  setState: React.Dispatch<React.SetStateAction<T>>,
  field: keyof T
) {
  return useCallback(
    (value: string) => {
      setState((prev) => ({
        ...prev,
        [field]: value,
      }));
    },
    [setState, field]
  );
}

/**
 * Creates memoized array manipulation handlers
 */
export function useArrayHandlers<T>(
  items: T[],
  setItems: React.Dispatch<React.SetStateAction<T[]>>
) {
  const add = useCallback(
    (item: T) => {
      setItems((prev) => [...prev, item]);
    },
    [setItems]
  );

  const remove = useCallback(
    (index: number) => {
      setItems((prev) => prev.filter((_, i) => i !== index));
    },
    [setItems]
  );

  const update = useCallback(
    (index: number, item: T) => {
      setItems((prev) => prev.map((prevItem, i) => (i === index ? item : prevItem)));
    },
    [setItems]
  );

  const move = useCallback(
    (fromIndex: number, toIndex: number) => {
      setItems((prev) => {
        const newItems = [...prev];
        const [removed] = newItems.splice(fromIndex, 1);
        newItems.splice(toIndex, 0, removed);
        return newItems;
      });
    },
    [setItems]
  );

  const clear = useCallback(() => {
    setItems([]);
  }, [setItems]);

  return {
    add,
    remove,
    update,
    move,
    clear,
  };
}

/**
 * Creates a memoized toggle handler
 */
export function useToggle(initialValue: boolean = false) {
  const [value, setValue] = useState(initialValue);
  
  const toggle = useCallback(() => {
    setValue((prev) => !prev);
  }, []);
  
  const setTrue = useCallback(() => {
    setValue(true);
  }, []);
  
  const setFalse = useCallback(() => {
    setValue(false);
  }, []);
  
  return {
    value,
    toggle,
    setTrue,
    setFalse,
    setValue,
  };
}

/**
 * Creates memoized form handlers
 */
export function useFormHandlers<T extends Record<string, any>>(
  initialState: T,
  onSubmit?: (data: T) => void | Promise<void>
) {
  const [formData, setFormData] = useState<T>(initialState);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = useCallback(
    (field: keyof T) => (value: any) => {
      setFormData((prev) => ({
        ...prev,
        [field]: value,
      }));
      // Clear error for this field when it changes
      if (errors[field]) {
        setErrors((prev) => {
          const newErrors = { ...prev };
          delete newErrors[field];
          return newErrors;
        });
      }
    },
    [errors]
  );

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      
      if (!onSubmit) return;
      
      setIsSubmitting(true);
      try {
        await onSubmit(formData);
      } finally {
        setIsSubmitting(false);
      }
    },
    [formData, onSubmit]
  );

  const reset = useCallback(() => {
    setFormData(initialState);
    setErrors({});
    setIsSubmitting(false);
  }, [initialState]);

  const setFieldValue = useCallback((field: keyof T, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const setFieldError = useCallback((field: keyof T, error: string) => {
    setErrors((prev) => ({
      ...prev,
      [field]: error,
    }));
  }, []);

  return {
    formData,
    errors,
    isSubmitting,
    handleChange,
    handleSubmit,
    reset,
    setFieldValue,
    setFieldError,
    setFormData,
    setErrors,
  };
}

/**
 * Creates a memoized debounced handler
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    },
    [callback, delay]
  ) as T;
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return debouncedCallback;
}

/**
 * Creates a memoized event handler with prevent default
 */
export function usePreventDefault<T extends React.SyntheticEvent>(
  handler?: (e: T) => void
) {
  return useCallback(
    (e: T) => {
      e.preventDefault();
      handler?.(e);
    },
    [handler]
  );
}

/**
 * Creates a memoized event handler with stop propagation
 */
export function useStopPropagation<T extends React.SyntheticEvent>(
  handler?: (e: T) => void
) {
  return useCallback(
    (e: T) => {
      e.stopPropagation();
      handler?.(e);
    },
    [handler]
  );
}

// Import React hooks that were referenced but not imported
import { useState, useRef, useEffect } from 'react';