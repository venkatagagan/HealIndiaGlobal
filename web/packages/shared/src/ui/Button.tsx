import type { ComponentProps, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'accent' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const BASE =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium ' +
  'transition-[color,background-color,border-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-50 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary bg-linear-to-b from-cta-from to-cta-to text-primary-fg shadow-glow hover:from-primary-hover hover:to-primary-hover',
  secondary: 'bg-surface-2 text-fg hover:bg-border',
  outline: 'border border-border bg-surface text-fg shadow-xs hover:border-border-strong hover:bg-surface-2',
  ghost: 'text-fg hover:bg-surface-2',
  danger: 'bg-danger-strong text-danger-fg shadow-sm hover:bg-danger-hover',
  accent: 'bg-accent text-accent-fg shadow-glow-accent hover:bg-accent-hover',
  link: 'h-auto px-0 text-primary-ink underline-offset-4 hover:underline',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs',
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'size-10 p-0',
  'icon-sm': 'size-8 p-0',
};

/** Class names of a button; use for <a>/<Link> elements styled as buttons. */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
  fullWidth = false,
): string {
  return cn(BASE, VARIANTS[variant], variant === 'link' ? '' : SIZES[size], fullWidth && 'w-full', className);
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** shows a spinner, sets aria-busy and disables the button */
  loading?: boolean;
  /** icon before the label (`icon` is an alias) */
  leftIcon?: ReactNode;
  icon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

/** Accessible button. Defaults to `type="button"` so it never submits a form by accident. */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  icon,
  rightIcon,
  fullWidth = false,
  className,
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const lead = leftIcon ?? icon;
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className, fullWidth)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : lead}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

export interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  icon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

/** react-router <Link> styled as a button (in-app navigation). For external URLs use <a className={buttonClasses()}>. */
export function LinkButton({
  variant = 'primary',
  size = 'md',
  leftIcon,
  icon,
  rightIcon,
  fullWidth = false,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={buttonClasses(variant, size, typeof className === 'string' ? className : undefined, fullWidth)} {...rest}>
      {leftIcon ?? icon}
      {children}
      {rightIcon}
    </Link>
  );
}
