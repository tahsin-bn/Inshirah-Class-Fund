import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 select-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-ink hover:bg-brand-strong shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)]',
        secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken',
        ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
        danger: 'bg-bad text-white hover:opacity-90',
        'danger-ghost': 'text-bad hover:bg-bad-soft',
        link: 'text-brand underline-offset-4 hover:underline px-0 h-auto',
      },
      size: {
        sm: 'h-8 px-3 text-[13px] rounded-[var(--radius-ctl)]',
        md: 'h-10 px-4 text-sm rounded-[var(--radius-ctl)]',
        lg: 'h-12 px-5 text-[15px] rounded-[10px]',
        icon: 'h-10 w-10 rounded-[var(--radius-ctl)]',
        'icon-sm': 'h-8 w-8 rounded-[var(--radius-ctl)]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
