import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';
import { Button } from './Button';

// -----------------------------------------------------------------------------------------------------------
// Shared overlay behaviour: portal, focus trap + restore, Escape, scroll lock
// -----------------------------------------------------------------------------------------------------------
const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

let scrollLocks = 0;
let previousOverflow = '';

function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  if (scrollLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
  return () => {
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0) document.body.style.overflow = previousOverflow;
  };
}

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true' && el.offsetParent !== null,
  );
}

function useOverlay(
  open: boolean,
  panelRef: RefObject<HTMLDivElement | null>,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const unlock = lockScroll();
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = initialFocusRef?.current ?? panel.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(panel)[0] ?? panel;
      target.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      unlock();
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open, panelRef, initialFocusRef]);
}

function trapKeyDown(event: KeyboardEvent<HTMLDivElement>, panel: HTMLDivElement | null, onEscape?: () => void) {
  if (event.key === 'Escape') {
    if (onEscape) {
      event.stopPropagation();
      event.preventDefault();
      onEscape();
    }
    return;
  }
  if (event.key !== 'Tab' || !panel) return;
  event.stopPropagation();
  const items = focusables(panel);
  if (items.length === 0) {
    event.preventDefault();
    panel.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === panel)) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first?.focus();
  }
}

function Portal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

function CloseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="-me-1.5 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X className="size-5" aria-hidden />
    </button>
  );
}

// -----------------------------------------------------------------------------------------------------------
// Modal
// -----------------------------------------------------------------------------------------------------------
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const MODAL_SIZES: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  full: 'sm:max-w-[calc(100vw-2rem)]',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** action buttons (right aligned) */
  footer?: ReactNode;
  size?: ModalSize;
  /** close when the backdrop is clicked (default true) */
  closeOnOverlayClick?: boolean;
  /** close on Escape (default true) */
  closeOnEscape?: boolean;
  hideCloseButton?: boolean;
  /** element focused on open (default: [data-autofocus], else the first focusable element) */
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  /** accessible name when there is no visible title */
  'aria-label'?: string;
}

/** Accessible dialog (portal, focus trap, Escape, scroll lock). Bottom sheet on small screens. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  hideCloseButton = false,
  initialFocusRef,
  className,
  'aria-label': ariaLabel,
}: ModalProps) {
  const { t } = useCommonTranslation();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  useOverlay(open, panelRef, initialFocusRef);
  if (!open) return null;
  const titleId = title ? `${id}-title` : undefined;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <div
          className="fixed inset-0 animate-fade-in bg-overlay"
          aria-hidden
          onClick={closeOnOverlayClick ? onClose : undefined}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          aria-label={titleId ? undefined : ariaLabel}
          tabIndex={-1}
          onKeyDown={(event) => trapKeyDown(event, panelRef.current, closeOnEscape ? onClose : undefined)}
          className={cn(
            'relative z-10 flex max-h-[92vh] w-full animate-scale-in flex-col overflow-hidden rounded-t-2xl border border-border',
            'bg-surface text-fg shadow-overlay focus:outline-none sm:rounded-2xl',
            MODAL_SIZES[size],
            className,
          )}
        >
          {(title || !hideCloseButton) && (
            <div className="flex items-start justify-between gap-4 px-5 pt-5">
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-lg font-semibold leading-7 text-fg">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descriptionId} className="mt-1 text-sm text-muted">
                    {description}
                  </p>
                )}
              </div>
              {!hideCloseButton && <CloseButton onClick={onClose} label={t('actions.close')} />}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t border-border bg-surface-2/40 px-5 py-3 sm:flex-row sm:justify-end">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}

// -----------------------------------------------------------------------------------------------------------
// Drawer (side panel)
// -----------------------------------------------------------------------------------------------------------
export type DrawerSize = 'sm' | 'md' | 'lg' | 'xl';

const DRAWER_SIZES: Record<DrawerSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-xl',
  xl: 'max-w-3xl',
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** text under the title (`subtitle` is an alias) */
  description?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** "end" = right in LTR / left in RTL (default) */
  side?: 'start' | 'end';
  /** panel width (`width` is an alias) */
  size?: DrawerSize;
  width?: DrawerSize;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  hideCloseButton?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  'aria-label'?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  subtitle,
  children,
  footer,
  side = 'end',
  size,
  width,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  hideCloseButton = false,
  initialFocusRef,
  className,
  'aria-label': ariaLabel,
}: DrawerProps) {
  const { t } = useCommonTranslation();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const id = useId();
  useOverlay(open, panelRef, initialFocusRef);
  if (!open) return null;
  const sub = description ?? subtitle;
  const titleId = title ? `${id}-title` : undefined;
  const descriptionId = sub ? `${id}-description` : undefined;
  return (
    <Portal>
      <div className="fixed inset-0 z-50">
        <div className="fixed inset-0 animate-fade-in bg-overlay" aria-hidden onClick={closeOnOverlayClick ? onClose : undefined} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          aria-label={titleId ? undefined : ariaLabel}
          tabIndex={-1}
          onKeyDown={(event) => trapKeyDown(event, panelRef.current, closeOnEscape ? onClose : undefined)}
          className={cn(
            'fixed inset-y-0 z-10 flex w-full flex-col bg-surface text-fg shadow-overlay focus:outline-none',
            side === 'end' ? 'end-0 animate-slide-in-end border-s border-border' : 'start-0 animate-slide-in-start border-e border-border',
            DRAWER_SIZES[size ?? width ?? 'md'],
            className,
          )}
        >
          {(title || !hideCloseButton) && (
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-lg font-semibold leading-7 text-fg">
                    {title}
                  </h2>
                )}
                {sub && (
                  <p id={descriptionId} className="mt-0.5 text-sm text-muted">
                    {sub}
                  </p>
                )}
              </div>
              {!hideCloseButton && <CloseButton onClick={onClose} label={t('actions.close')} />}
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </div>
      </div>
    </Portal>
  );
}

// -----------------------------------------------------------------------------------------------------------
// ConfirmDialog
// -----------------------------------------------------------------------------------------------------------
export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  /** may return a promise: the confirm button shows a spinner until it settles, then the dialog closes */
  onConfirm: () => void | Promise<unknown>;
  title?: ReactNode;
  /** body text (`message` is an alias) */
  description?: ReactNode;
  message?: ReactNode;
  /** extra content (e.g. a reason textarea) */
  children?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  tone?: 'primary' | 'danger';
  /** external loading flag (e.g. mutation.isPending) */
  loading?: boolean;
  /** disable the confirm button (e.g. until a reason is typed) */
  confirmDisabled?: boolean;
  /** keep the dialog open after onConfirm resolves (default false) */
  keepOpenOnConfirm?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  message,
  children,
  confirmLabel,
  cancelLabel,
  tone = 'primary',
  loading = false,
  confirmDisabled = false,
  keepOpenOnConfirm = false,
}: ConfirmDialogProps) {
  const { t } = useCommonTranslation();
  const [pending, setPending] = useState(false);
  const busy = loading || pending;
  const handleConfirm = async () => {
    try {
      setPending(true);
      await onConfirm();
      if (!keepOpenOnConfirm) onClose();
    } catch {
      // the caller reports the error (toast / inline); keep the dialog open so the user can retry
    } finally {
      setPending(false);
    }
  };
  const body = description ?? message;
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      size="sm"
      hideCloseButton
      title={title ?? t('dialog.confirmTitle')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {cancelLabel ?? t('actions.cancel')}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={() => void handleConfirm()}
            loading={busy}
            disabled={confirmDisabled}
            data-autofocus={tone === 'danger' ? undefined : true}
          >
            {confirmLabel ?? t('actions.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {tone === 'danger' && (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger-ink">
            <AlertTriangle className="size-5" aria-hidden />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-3 text-sm text-muted">
          {body !== undefined ? body : tone === 'danger' ? <p>{t('dialog.confirmDescription')}</p> : null}
          {children}
        </div>
      </div>
    </Modal>
  );
}
