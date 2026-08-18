import { useState, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';

/**
 * Chip editor for list-shaped values. Commits on Enter, comma, space or
 * blur, and validates each entry before it becomes a chip.
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  validate,
  invalid = false,
  monospace = false,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  validate?: (entry: string) => string | null;
  invalid?: boolean;
  monospace?: boolean;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const commit = (raw: string): boolean => {
    const entry = raw.trim().replace(/,$/, '');
    if (!entry) return true;

    const problem = validate?.(entry) ?? null;
    if (problem) {
      setError(problem);
      return false;
    }
    if (value.includes(entry)) {
      setDraft('');
      setError(null);
      return true;
    }
    onChange([...value, entry]);
    setDraft('');
    setError(null);
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
      // Enter would otherwise submit the surrounding form mid-entry.
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-control border bg-surface p-1.5',
          invalid || error ? 'border-danger' : 'border-line focus-within:border-brand',
        )}
      >
        {value.map((entry) => (
          <span
            key={entry}
            className={cn(
              'inline-flex items-center gap-1 rounded-full bg-raised py-1 pl-2.5 pr-1 text-[13px] text-ink',
              monospace && 'font-mono text-[12px]',
            )}
          >
            {entry}
            <button
              type="button"
              onClick={() => onChange(value.filter((item) => item !== entry))}
              aria-label={`Remove ${entry}`}
              className="flex h-4 w-4 items-center justify-center rounded-full text-faint transition-colors hover:bg-danger/15 hover:text-danger"
            >
              <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden="true">
                <path
                  d="M2 2l8 8M10 2l-8 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          placeholder={value.length === 0 ? placeholder : ''}
          className={cn(
            'min-w-[12ch] flex-1 bg-transparent px-1.5 py-1 text-sm text-ink placeholder:text-faint focus:outline-none',
            monospace && 'font-mono text-[13px]',
          )}
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
