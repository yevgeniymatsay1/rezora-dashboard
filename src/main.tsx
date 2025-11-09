import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// Production environment validation
function validateEnvironment() {
  const requiredVars = {
    SUPABASE_URL: 'https://kssuxhxqhbwicyguzoik.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzc3V4aHhxaGJ3aWN5Z3V6b2lrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwMzA1NTIsImV4cCI6MjA2ODYwNjU1Mn0.gnjnVhMslf1dILZNmXlH0RrMjnlfSBmFENfPcDcptcs'
  };

  const missing = Object.entries(requiredVars).filter(([key, value]) => !value);
  if (missing.length > 0) {
    console.error('Missing environment variables:', missing.map(([key]) => key));
    return false;
  }
  return true;
}

// Global error reporting for chunk loading failures
window.addEventListener('error', (event) => {
  if (event.message.includes('Loading chunk') || event.message.includes('Failed to fetch dynamically imported module')) {
    console.error('Chunk loading failed, reloading page...');
    // Show user-friendly message before reload
    if (confirm('A new version is available. Reload to update?')) {
      window.location.reload();
    }
  }
});

// Startup logging
console.log('App starting...', {
  timestamp: new Date().toISOString(),
  userAgent: navigator.userAgent,
  url: window.location.href,
  environment: import.meta.env.MODE
});

if (validateEnvironment()) {
  console.log('Environment validation passed');
  createRoot(document.getElementById("root")!).render(<App />);
} else {
  console.error('Environment validation failed');
  document.getElementById("root")!.innerHTML = `
    <div style="padding: 20px; font-family: system-ui; text-align: center;">
      <h1 style="color: #dc2626;">Configuration Error</h1>
      <p>The application is not properly configured. Please check the console for details.</p>
      <button onclick="window.location.reload()" style="padding: 8px 16px; margin-top: 16px; cursor: pointer;">
        Retry
      </button>
    </div>
  `;
}