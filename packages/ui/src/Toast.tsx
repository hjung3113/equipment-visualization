import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleX, Info, TriangleAlert, X } from 'lucide-react';
import { Button, cn } from '@ap/ui';

export type ToastTone = 'info' | 'warning' | 'danger';

export interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}

export interface ToastRegionProps {
  toasts: readonly ToastItem[];
  onDismiss: (id: number) => void;
  labels: { dismiss: string };
}

const TOAST_MS = 5000;

/** Toast list owned by the host: keeps the last four, each removed after 5 s or on `dismiss`. */
export function useToastQueue() {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);
  const nextId = useRef(1);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((item) => item.id !== id)), []);
  const notify = useCallback(
    (text: string, tone: ToastTone = 'info') => {
      const item: ToastItem = { id: nextId.current++, text, tone };
      setToasts((list) => [...list.slice(-3), item]);
      // Not cleared on cleanup: StrictMode re-runs effects, so a late timer is dropped by the mounted guard instead.
      setTimeout(() => {
        if (mounted.current) dismiss(item.id);
      }, TOAST_MS);
    },
    [dismiss],
  );
  return { toasts, notify, dismiss };
}

const BORDER = {
  danger: 'border-accent-danger',
  warning: 'border-accent-warn',
  info: 'border-border-strong',
} as const;

const ICON = {
  danger: { Icon: CircleX, className: 'text-accent-danger' },
  warning: { Icon: TriangleAlert, className: 'text-accent-warn' },
  info: { Icon: Info, className: 'text-accent-primary' },
} as const;

export function ToastRegion({ toasts, onDismiss, labels }: ToastRegionProps) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(420px,90vw)] flex-col gap-2">
      {toasts.map(({ id, text, tone }) => {
        const { Icon, className } = ICON[tone];
        return (
          <div
            key={id}
            role={tone === 'danger' ? 'alert' : 'status'}
            className={cn('pointer-events-auto flex items-start gap-2 rounded-md border bg-surface-card px-3 py-2.5 text-xs text-text-primary shadow-lg', BORDER[tone])}
          >
            <Icon className={cn('mt-0.5 size-4 shrink-0', className)} aria-hidden />
            <span className="flex-1">{text}</span>
            <Button type="button" variant="ghost" size="icon-xs" aria-label={labels.dismiss} onClick={() => onDismiss(id)}>
              <X className="size-3.5" aria-hidden />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
