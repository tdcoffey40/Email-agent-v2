import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

const CONTROL_BASE =
  'w-full rounded-control border bg-surface px-3 text-sm text-ink placeholder:text-faint ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-60';

function controlClasses(invalid: boolean, extra?: string): string {
  return cn(
    CONTROL_BASE,
    invalid ? 'border-danger focus:border-danger' : 'border-line focus:border-brand',
    extra,
  );
}

/**
 * Wraps a control with its label, hint and error, and wires up the aria
 * relationships so the error is announced rather than merely coloured.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  htmlFor,
  className,
}: {
  label?: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, cn('h-10', className))}
      {...props}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, cn('py-2.5 leading-relaxed', className))}
      {...props}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid = false, className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={controlClasses(invalid, cn('h-10 pr-8', className))}
      {...props}
    >
      {children}
    </select>
  );
});

/** An input with a fixed suffix, used for the `name@domain` address editor. */
export function SuffixInput({
  suffix,
  invalid = false,
  className,
  ...props
}: InputProps & { suffix: string }) {
  return (
    <div
      className={cn(
        'flex h-10 items-stretch overflow-hidden rounded-control border bg-surface',
        invalid ? 'border-danger' : 'border-line focus-within:border-brand',
        className,
      )}
    >
      <input
        aria-invalid={invalid || undefined}
        className="min-w-0 flex-1 bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:outline-none"
        {...props}
      />
      <span className="flex select-none items-center border-l border-line bg-raised px-3 font-mono text-[13px] text-muted">
        {suffix}
      </span>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors disabled:opacity-50',
          checked ? 'bg-brand' : 'bg-line',
        )}
      >
        <span
          className={cn(
            'block h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-4' : 'translate-x-0',
          )}
        />
      </button>
      <div className="min-w-0">
        <label htmlFor={id} className="block cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description ? <p className="text-[13px] text-muted">{description}</p> : null}
      </div>
    </div>
  );
}
