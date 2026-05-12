import { cn } from '@/lib/utils';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-white shadow-lg shadow-accent/20 ' +
    'hover:bg-accent-hover hover:shadow-accent/40 hover:-translate-y-0.5 ' +
    'active:translate-y-0 active:scale-[0.98] ' +
    'focus-visible:ring-accent',
  secondary:
    'bg-bg-hover text-ink border border-line-strong ' +
    'hover:border-accent hover:bg-bg-card ' +
    'active:scale-[0.98] ' +
    'focus-visible:ring-accent',
  ghost:
    'text-ink-muted hover:text-ink hover:bg-bg-hover ' +
    'active:scale-[0.98] ' +
    'focus-visible:ring-accent',
  danger:
    'bg-danger/90 text-white shadow-lg shadow-danger/20 ' +
    'hover:bg-danger hover:shadow-danger/40 ' +
    'active:scale-[0.98] ' +
    'focus-visible:ring-danger',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-13 px-7 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          'relative inline-flex items-center justify-center gap-2 rounded-lg font-medium select-none',
          'transition-all duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          // When disabled, kill every motion / shadow side-effect so the button
          // doesn't appear interactive.
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none disabled:active:scale-100',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {/* Spinner overlays the label so the button width stays stable
            between idle and loading — no layout shift on submit. */}
        {loading && (
          <span
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          </span>
        )}
        <span className={cn('inline-flex items-center gap-2', loading && 'opacity-0')}>
          {children}
        </span>
      </button>
    );
  }
);
Button.displayName = 'Button';
