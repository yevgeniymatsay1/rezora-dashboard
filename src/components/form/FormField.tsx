import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { WarningCircle, CheckCircle, CircleNotch } from '@phosphor-icons/react';

interface FormFieldProps {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password' | 'tel' | 'number' | 'url' | 'textarea';
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  success?: boolean;
  helperText?: string;
  validation?: (value: string) => string | undefined;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  className?: string;
  rows?: number; // for textarea
}

export function FormField({
  name,
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  placeholder,
  required = false,
  disabled = false,
  loading = false,
  error: externalError,
  success = false,
  helperText,
  validation,
  validateOnChange = false,
  validateOnBlur = true,
  className,
  rows = 3
}: FormFieldProps) {
  const [internalError, setInternalError] = useState<string>('');
  const [touched, setTouched] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const error = externalError || internalError;
  const showError = error && touched;
  const showSuccess = success && !error && touched && value;

  useEffect(() => {
    if (validateOnChange && touched && validation) {
      const timer = setTimeout(() => {
        setIsValidating(true);
        const validationError = validation(value);
        setInternalError(validationError || '');
        setIsValidating(false);
      }, 300); // Debounce validation
      
      return () => clearTimeout(timer);
    }
  }, [value, validateOnChange, touched, validation]);

  const handleBlur = () => {
    setTouched(true);
    
    if (validateOnBlur && validation) {
      setIsValidating(true);
      const validationError = validation(value);
      setInternalError(validationError || '');
      setIsValidating(false);
    }
    
    onBlur?.();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    if (!touched) {
      setTouched(true);
    }
  };

  const fieldClasses = cn(
    'transition-all duration-200',
    showError && 'border-destructive focus:ring-destructive',
    showSuccess && 'border-green-500 focus:ring-green-500',
    (loading || isValidating) && 'opacity-70',
    className
  );

  const InputComponent = type === 'textarea' ? Textarea : Input;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={name} className={cn(required && "after:content-['*'] after:ml-0.5 after:text-destructive")}>
          {label}
        </Label>
        {(loading || isValidating) && (
          <CircleNotch className="h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
      
      <div className="relative">
        <InputComponent
          id={name}
          name={name}
          type={type === 'textarea' ? undefined : type}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled || loading}
          className={fieldClasses}
          rows={type === 'textarea' ? rows : undefined}
          aria-invalid={showError}
          aria-describedby={
            showError ? `${name}-error` : helperText ? `${name}-helper` : undefined
          }
        />
        
        {showError && (
          <WarningCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />
        )}
        
        {showSuccess && (
          <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 pointer-events-none" />
        )}
      </div>
      
      {showError && (
        <p id={`${name}-error`} className="text-sm text-destructive animate-in fade-in-0 slide-in-from-top-1">
          {error}
        </p>
      )}
      
      {helperText && !showError && (
        <p id={`${name}-helper`} className="text-sm text-muted-foreground">
          {helperText}
        </p>
      )}
    </div>
  );
}