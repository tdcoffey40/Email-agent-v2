import { useState } from 'react';
import { cn } from '../lib/cn';

export function CopyButton({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard access can be blocked; the address is visible either way.
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : `Copy ${value}`}
      className={cn(
        'flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors',
        copied ? 'text-success' : 'text-faint hover:bg-raised hover:text-ink',
        className,
      )}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
          <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10.5 3.5h-7a1 1 0 0 0-1 1v7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
