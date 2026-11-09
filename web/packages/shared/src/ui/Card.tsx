import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CardProps extends ComponentProps<'div'> {
  /** inner padding (default false; use CardHeader/CardBody for structured cards) */
  padded?: boolean;
  /** hover lift for clickable cards */
  interactive?: boolean;
}

export function Card({ padded = false, interactive = false, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-border bg-surface text-fg shadow-card',
        padded && 'p-4 sm:p-5',
        interactive && 'transition hover:-translate-y-px hover:border-border-strong hover:shadow-raised',
        className,
      )}
      {...rest}
    />
  );
}

export interface CardHeaderProps extends Omit<ComponentProps<'div'>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  /** right-aligned actions (buttons, badges) */
  actions?: ReactNode;
  icon?: ReactNode;
}

/** Either pass `title` / `description` / `actions`, or arbitrary children. */
export function CardHeader({ title, description, actions, icon, className, children, ...rest }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5', className)} {...rest}>
      {title !== undefined || description !== undefined ? (
        <div className="flex min-w-0 items-start gap-3">
          {icon && <div className="mt-0.5 shrink-0 text-muted">{icon}</div>}
          <div className="min-w-0">
            {title !== undefined && <CardTitle>{title}</CardTitle>}
            {description !== undefined && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
      ) : (
        children
      )}
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardTitle({ className, ...rest }: ComponentProps<'h3'>) {
  return <h3 className={cn('text-base font-semibold leading-6 text-fg', className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: ComponentProps<'p'>) {
  return <p className={cn('mt-0.5 text-sm text-muted', className)} {...rest} />;
}

export function CardBody({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('px-4 py-4 sm:px-5', className)} {...rest} />;
}

/** Alias of CardBody. */
export const CardContent = CardBody;

export function CardFooter({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-5', className)}
      {...rest}
    />
  );
}
