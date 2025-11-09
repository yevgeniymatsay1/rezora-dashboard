import React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { CircleNotch, CheckCircle, WarningCircle, ArrowRight } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface FormButtonProps extends ButtonProps {
  loading?: boolean;
  success?: boolean;
  error?: boolean;
  loadingText?: string;
  successText?: string;
  errorText?: string;
  showArrow?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
}

export function FormButton({
  children,
  loading = false,
  success = false,
  error = false,
  loadingText,
  successText,
  errorText,
  showArrow = false,
  disabled,
  className,
  variant = 'default',
  onClick,
  ...props
}: FormButtonProps) {
  const [isProcessing, setIsProcessing] = React.useState(false);
  
  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!onClick || loading || isProcessing) return;
    
    setIsProcessing(true);
    try {
      await onClick(e);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const isLoading = loading || isProcessing;
  const isDisabled = disabled || isLoading || success;
  
  // Determine button variant based on state
  const currentVariant = success ? 'default' : error ? 'destructive' : variant;
  
  // Determine button content
  let content: React.ReactNode;
  let icon: React.ReactNode;
  
  if (isLoading) {
    icon = <CircleNotch className="mr-2 h-4 w-4 animate-spin" />;
    content = loadingText || children;
  } else if (success) {
    icon = <CheckCircle className="mr-2 h-4 w-4" />;
    content = successText || children;
  } else if (error) {
    icon = <WarningCircle className="mr-2 h-4 w-4" />;
    content = errorText || children;
  } else {
    icon = null;
    content = children;
  }
  
  const buttonClass = cn(
    'transition-all duration-200',
    success && 'bg-green-600 hover:bg-green-700',
    className
  );
  
  return (
    <Button
      {...props}
      variant={currentVariant}
      disabled={isDisabled}
      className={buttonClass}
      onClick={handleClick}
    >
      {icon}
      {content}
      {showArrow && !isLoading && !success && !error && (
        <ArrowRight className="ml-2 h-4 w-4" />
      )}
    </Button>
  );
}

// Specialized form submission button
export function SubmitButton({
  children = 'Submit',
  loadingText = 'Submitting...',
  successText = 'Success!',
  errorText = 'Failed. Try again',
  ...props
}: Omit<FormButtonProps, 'type'>) {
  return (
    <FormButton
      type="submit"
      loadingText={loadingText}
      successText={successText}
      errorText={errorText}
      {...props}
    >
      {children}
    </FormButton>
  );
}

// Specialized save button
export function SaveButton({
  children = 'Save',
  loadingText = 'Saving...',
  successText = 'Saved!',
  ...props
}: FormButtonProps) {
  return (
    <FormButton
      loadingText={loadingText}
      successText={successText}
      {...props}
    >
      {children}
    </FormButton>
  );
}

// Specialized next/continue button
export function NextButton({
  children = 'Next',
  loadingText = 'Loading...',
  ...props
}: FormButtonProps) {
  return (
    <FormButton
      showArrow
      loadingText={loadingText}
      {...props}
    >
      {children}
    </FormButton>
  );
}