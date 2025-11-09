import React from 'react';
import { cn } from '@/lib/utils';

/**
 * Component to indicate required fields in forms
 */

interface RequiredFieldIndicatorProps {
  required?: boolean;
  className?: string;
  showText?: boolean;
}

export function RequiredFieldIndicator({ 
  required = true, 
  className,
  showText = false 
}: RequiredFieldIndicatorProps) {
  if (!required) return null;
  
  return (
    <span 
      className={cn('text-destructive ml-1', className)}
      aria-label="required"
      role="presentation"
    >
      *
      {showText && <span className="sr-only">required</span>}
    </span>
  );
}

/**
 * Label with required indicator
 */
interface LabelWithRequiredProps {
  children: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
}

export function LabelWithRequired({
  children,
  required = false,
  htmlFor,
  className
}: LabelWithRequiredProps) {
  return (
    <label htmlFor={htmlFor} className={cn('text-sm font-medium', className)}>
      {children}
      <RequiredFieldIndicator required={required} />
    </label>
  );
}

/**
 * Helper text for required fields
 */
interface RequiredFieldsNoteProps {
  className?: string;
}

export function RequiredFieldsNote({ className }: RequiredFieldsNoteProps) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>
      <RequiredFieldIndicator /> indicates required fields
    </p>
  );
}