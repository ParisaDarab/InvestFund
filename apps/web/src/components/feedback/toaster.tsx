'use client';

import { createContext, use, useCallback, useMemo, useState } from 'react';

import type { ReactNode } from 'react';

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';

interface ToastInput {
  title: string;
  description?: string | undefined;
  variant?: 'default' | 'destructive';
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((input: ToastInput) => void) | null>(null);

/** App-wide toasts for mutation results ("Saved", "Could not send"...). */
export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((input: ToastInput) => {
    setItems((current) => [...current.slice(-3), { ...input, id: Date.now() + Math.random() }]);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext value={value}>
      <ToastProvider swipeDirection="right" duration={5000}>
        {children}
        {items.map((item) => (
          <Toast
            key={item.id}
            variant={item.variant ?? 'default'}
            onOpenChange={(open) => {
              if (!open) setItems((current) => current.filter((i) => i.id !== item.id));
            }}
          >
            <div className="grid gap-1">
              <ToastTitle>{item.title}</ToastTitle>
              {item.description === undefined ? null : (
                <ToastDescription>{item.description}</ToastDescription>
              )}
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext>
  );
}

export function useToast(): (input: ToastInput) => void {
  const value = use(ToastContext);
  if (value === null) throw new Error('useToast must be used inside Toaster');
  return value;
}
