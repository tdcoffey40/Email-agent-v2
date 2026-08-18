import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className ?? 'h-5 w-5')}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2Z"
      />
    </svg>
  );
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-muted" role="status">
      <Spinner className="h-5 w-5" />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ALERT_TONES: Record<AlertTone, string> = {
  info: 'bg-brand-soft text-ink border-brand/25',
  success: 'bg-success-soft text-ink border-success/30',
  warning: 'bg-warning-soft text-ink border-warning/35',
  danger: 'bg-danger-soft text-ink border-danger/35',
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-card border px-4 py-3 text-sm', ALERT_TONES[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={cn('text-muted', title && 'mt-1')}>{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-line px-6 py-16 text-center">
      {icon ? <div className="mb-4 text-3xl">{icon}</div> : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
