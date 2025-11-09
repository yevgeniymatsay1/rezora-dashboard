import { createContext, useContext, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';

interface SuccessFeedbackContextType {
  showSuccess: (message: string) => void;
}

const SuccessFeedbackContext = createContext<SuccessFeedbackContextType | undefined>(undefined);

export function SuccessFeedbackProvider({ children }: { children: ReactNode }) {
  const showSuccess = useCallback((message: string) => {
    toast.success(message);
  }, []);

  return (
    <SuccessFeedbackContext.Provider value={{ showSuccess }}>
      {children}
    </SuccessFeedbackContext.Provider>
  );
}

export function useSuccessFeedback() {
  const context = useContext(SuccessFeedbackContext);
  if (!context) {
    throw new Error('useSuccessFeedback must be used within a SuccessFeedbackProvider');
  }
  return context;
}