import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: Variant;
  loadingText?: string;
  children: ReactNode;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
};

/**
 * Button dengan loading state bawaan. Mencegah double-click dan
 * memberikan feedback visual konsisten di seluruh aplikasi.
 */
export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  ({ loading = false, variant = 'primary', loadingText, disabled, children, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        type={props.type ?? 'button'}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={`btn ${VARIANT_CLASS[variant]} ${className}`}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>{loadingText ?? 'Memproses...'}</span>
          </>
        ) : (
          children
        )}
      </button>
    );
  },
);

LoadingButton.displayName = 'LoadingButton';
