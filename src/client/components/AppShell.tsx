import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { cn } from '../lib/cn';
import { useSession } from '../lib/session';
import { applyTheme, preferredTheme, type Theme } from '../lib/theme';
import { Button } from './ui/Button';

const NAV = [
  { to: '/', label: 'Agents', end: true },
  { to: '/activity', label: 'Activity', end: false },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, config, logout } = useSession();
  const navigate = useNavigate();
  const [theme, setTheme] = useState<Theme>(() => preferredTheme());

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <button
            onClick={() => navigate('/')}
            className="flex shrink-0 items-center gap-2 text-sm font-semibold text-ink"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-brand-ink">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
                <path
                  d="M2.5 5.5h15v9h-15z M2.5 6l7.5 5 7.5-5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            {config?.appName ?? 'Email Agents'}
          </button>

          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-control px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive ? 'bg-raised text-ink' : 'text-muted hover:text-ink',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="flex h-8 w-8 items-center justify-center rounded-control text-muted transition-colors hover:bg-raised hover:text-ink"
            >
              {theme === 'dark' ? (
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M10 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm7-4a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1ZM5 10a1 1 0 0 1-1 1H3a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1Zm10.07-5.07a1 1 0 0 1 0 1.41l-.7.71a1 1 0 1 1-1.42-1.42l.71-.7a1 1 0 0 1 1.41 0ZM7.05 13.66a1 1 0 0 1 0 1.41l-.71.71a1 1 0 0 1-1.41-1.42l.7-.7a1 1 0 0 1 1.42 0Zm8.02 2.12a1 1 0 0 1-1.41 0l-.71-.71a1 1 0 0 1 1.42-1.41l.7.7a1 1 0 0 1 0 1.42ZM6.34 5.34a1 1 0 0 1-1.41 0l-.71-.7A1 1 0 0 1 5.63 3.2l.71.71a1 1 0 0 1 0 1.42ZM10 15a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M17 11.3A7 7 0 1 1 8.7 3a5.6 5.6 0 0 0 8.3 8.3Z" />
                </svg>
              )}
            </button>
            <span className="hidden text-[13px] text-muted sm:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
