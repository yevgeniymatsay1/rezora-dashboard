import React, { createContext, useContext, useRef, useCallback } from 'react';

interface AriaLiveContextType {
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
}

const AriaLiveContext = createContext<AriaLiveContextType | null>(null);

/**
 * Provider for ARIA live region announcements
 * Place this at the root of your app
 */
export function AriaLiveProvider({ children }: { children: React.ReactNode }) {
  const politeRef = useRef<HTMLDivElement>(null);
  const assertiveRef = useRef<HTMLDivElement>(null);

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const ref = priority === 'assertive' ? assertiveRef : politeRef;
    if (ref.current) {
      // Clear and set message to ensure announcement
      ref.current.textContent = '';
      setTimeout(() => {
        if (ref.current) {
          ref.current.textContent = message;
        }
      }, 100);
    }
  }, []);

  return (
    <AriaLiveContext.Provider value={{ announce }}>
      {children}
      {/* Hidden live regions for screen reader announcements */}
      <div
        ref={politeRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />
      <div
        ref={assertiveRef}
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </AriaLiveContext.Provider>
  );
}

/**
 * Hook to announce messages to screen readers
 */
export function useAriaLive() {
  const context = useContext(AriaLiveContext);
  if (!context) {
    throw new Error('useAriaLive must be used within AriaLiveProvider');
  }
  return context;
}

/**
 * Component for status messages with live region
 */
export function StatusMessage({ 
  message, 
  type = 'info' 
}: { 
  message: string; 
  type?: 'info' | 'success' | 'warning' | 'error';
}) {
  const ariaLive = type === 'error' ? 'assertive' : 'polite';
  
  return (
    <div
      role="status"
      aria-live={ariaLive}
      aria-atomic="true"
      className={`rounded-md p-3 ${
        type === 'error' ? 'bg-destructive/10 text-destructive' :
        type === 'warning' ? 'bg-yellow-50 text-yellow-800' :
        type === 'success' ? 'bg-green-50 text-green-800' :
        'bg-blue-50 text-blue-800'
      }`}
    >
      {message}
    </div>
  );
}