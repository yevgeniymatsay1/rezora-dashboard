
import { lazy, Suspense } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DeveloperRoute } from "@/components/DeveloperRoute";
import { Layout } from "@/components/Layout";
import { AriaLiveProvider } from "@/lib/aria-live";
import { SkipToMainContent } from "@/lib/focus-trap";
import { SuccessFeedbackProvider } from "@/hooks/useSuccessFeedback";
import { CircleNotch as Loader2 } from "@phosphor-icons/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Eager load critical components
import Auth from "./pages/Auth";
import { Dashboard } from "@/components/Dashboard";

// Lazy load all other routes
const Agents = lazy(() => import("./pages/Agents"));
const AgentConfiguration = lazy(() => import("./pages/AgentConfiguration"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const ResultsView = lazy(() => import("./components/ResultsView"));
const Recordings = lazy(() => import("./pages/Recordings"));
const Settings = lazy(() => import("./pages/Settings"));
const Billing = lazy(() => import("./pages/Billing"));
const AdminPromptGenerator = lazy(() => import("./pages/AdminPromptGenerator"));
const AdminPromptFactorySettings = lazy(() => import("./pages/AdminPromptFactorySettings"));
const NotFound = () => <div>404 - Page Not Found</div>; // Temporary placeholder
const Appointments = lazy(() => import("./pages/Appointments"));


const queryClient = new QueryClient();

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  </div>
);

const App = () => (
  <ErrorBoundary 
    onError={(error, errorInfo) => {
      console.error('App Error:', error, errorInfo);
      // Report to error service in production
      if (window.errorHandler) {
        window.errorHandler.reportError(error, { context: 'App', errorInfo });
      }
    }}
    resetOnPropsChange
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AriaLiveProvider>
          <SuccessFeedbackProvider>
            <BrowserRouter>
              <SkipToMainContent />
              <Toaster />
              <AuthProvider>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/" element={
                    <ProtectedRoute>
                      <Layout />
                    </ProtectedRoute>
                  }>
                    <Route index element={<Dashboard />} />
                    <Route path="agents" element={
                      <Suspense fallback={<PageLoader />}>
                        <Agents />
                      </Suspense>
                    } />
                    <Route path="agent/configure/:templateId" element={
                      <Suspense fallback={<PageLoader />}>
                        <AgentConfiguration />
                      </Suspense>
                    } />
                    <Route path="agent/configure/edit/:agentId" element={
                      <Suspense fallback={<PageLoader />}>
                        <AgentConfiguration />
                      </Suspense>
                    } />
                    
                    <Route path="contacts" element={
                      <Suspense fallback={<PageLoader />}>
                        <Contacts />
                      </Suspense>
                    } />
                    <Route path="campaigns" element={
                      <Suspense fallback={<PageLoader />}>
                        <Campaigns />
                      </Suspense>
                    } />
                    <Route path="campaigns/:id/results" element={
                      <Suspense fallback={<PageLoader />}>
                        <ResultsView />
                      </Suspense>
                    } />
                    <Route path="admin/prompt-generator" element={
                      <Suspense fallback={<PageLoader />}>
                        <DeveloperRoute>
                          <AdminPromptGenerator />
                        </DeveloperRoute>
                      </Suspense>
                    } />
                    <Route path="admin/prompt-factory-settings" element={
                      <Suspense fallback={<PageLoader />}>
                        <DeveloperRoute>
                          <AdminPromptFactorySettings />
                        </DeveloperRoute>
                      </Suspense>
                    } />
                    <Route path="recordings" element={
                      <Suspense fallback={<PageLoader />}>
                        <Recordings />
                      </Suspense>
                    } />
                    <Route path="appointments" element={
                      <Suspense fallback={<PageLoader />}>
                        <Appointments />
                      </Suspense>
                    } />
                    <Route path="settings" element={
                      <Suspense fallback={<PageLoader />}>
                        <Settings />
                      </Suspense>
                    } />
                    <Route path="billing" element={
                      <Suspense fallback={<PageLoader />}>
                        <Billing />
                      </Suspense>
                    } />
                  </Route>

                  <Route path="*" element={
                    <Suspense fallback={<PageLoader />}>
                      <NotFound />
                    </Suspense>
                  } />
                </Routes>
              </Suspense>
              </AuthProvider>
            </BrowserRouter>
          </SuccessFeedbackProvider>
        </AriaLiveProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
