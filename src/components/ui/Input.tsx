'use client';

import { cn } from '@/lib/utils';
import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, type, ...props }, ref) => {
    const inputId = id || props.name;
    const isPassword = type === 'password';
    const [visible, setVisible] = useState(false);
    const effectiveType = isPassword && visible ? 'text' : type;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-ink-muted">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={effectiveType}
            className={cn(
              'w-full h-11 px-4 rounded-lg bg-bg-raised border border-line-strong text-ink',
              'placeholder:text-ink-faint',
              'transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
              isPassword && 'pr-11',
              error && 'border-danger focus:border-danger focus:ring-danger/20',
              className
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? '隱藏密碼' : '顯示密碼'}
              aria-pressed={visible}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-dim hover:text-ink transition-colors"
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {hint && !error && <p className="text-xs text-ink-dim">{hint}</p>}
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';
