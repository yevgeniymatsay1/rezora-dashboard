import { useState, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeSlash as EyeOff } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface FloatingLabelPasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: boolean;
}

export const FloatingLabelPasswordInput = forwardRef<HTMLInputElement, FloatingLabelPasswordInputProps>(
  ({ label, error, className, value, onChange, onFocus, onBlur, ...props }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const hasValue = value && String(value).length > 0;
    const isFloating = isFocused || hasValue;

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={onChange}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          className={cn(
            "peer pt-4 pb-1 h-14 pr-10",
            error && "border-destructive focus-visible:ring-destructive",
            className
          )}
          placeholder=" "
          {...props}
        />
        <label
          className={cn(
            "absolute left-3 transition-all duration-200 pointer-events-none",
            "text-muted-foreground",
            isFloating
              ? "top-1 text-xs"
              : "top-4 text-sm",
            error && "text-destructive"
          )}
        >
          {label}
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-14 px-3 py-2 hover:bg-transparent"
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Eye className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="sr-only">
            {showPassword ? "Hide password" : "Show password"}
          </span>
        </Button>
      </div>
    );
  }
);

FloatingLabelPasswordInput.displayName = "FloatingLabelPasswordInput";