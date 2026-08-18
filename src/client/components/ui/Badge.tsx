import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-muted border-line',
  brand: 'bg-brand-soft text-brand border-brand/25',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/35',
  danger: 'bg-danger-soft text-danger border-danger/30',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-5',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = 'neutral' }: { tone?: BadgeTone }) {
  const colors: Record<BadgeTone, string> = {
    neutral: 'bg-faint',
    brand: 'bg-brand',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  };
  return <span className={cn('h-1.5 w-1.5 rounded-full', colors[tone])} />;
}
