import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { ToastProvider } from './components/ui/Toast';
import { SessionProvider } from './lib/session';
import { applyTheme, preferredTheme } from './lib/theme';
import './styles.css';

// Set before first paint so the page never flashes the wrong theme.
applyTheme(preferredTheme());

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element.');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <App />
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
