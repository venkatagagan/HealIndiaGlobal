import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';

/**
 * Lightweight anchored popover (filters, menus). Rendered in a portal with fixed positioning so it is never
 * clipped by scrolling rows; flips above the anchor and clamps to the viewport. Escape / outside click close
 * it and focus returns to the trigger. Tabbing past the last control closes it too.
 */
export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** the trigger element (positioning + focus restore + outside-click exclusion) */
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** horizontal alignment to the anchor */
  align?: 'start' | 'end';
  /** id of the panel (wire to the trigger's aria-controls) */
  id?: string;
  /** accessible name of the panel */
  label?: string;
  role?: 'dialog' | 'menu' | 'listbox' | 'group';
  className?: string;
  /** keep children mounted (hidden) while closed - lets nested filters register their chips */
  keepMounted?: boolean;
  /** element inside the panel to focus on open (else the first focusable) */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Popover({
  open,
  onOpenChange,
  anchorRef,
  children,
  align = 'start',
  id,
  label,
  role = 'dialog',
  className,
  keepMounted = false,
  initialFocusRef,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  const initialFocus = useRef(initialFocusRef);
  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
    initialFocus.current = initialFocusRef;
  });
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const a = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 6;
    let left = align === 'end' ? a.right - width : a.left;
    left = Math.max(8, Math.min(left, vw - width - 8));
    const below = vh - a.bottom - gap - 8;
    const above = a.top - gap - 8;
    const flip = height > below && above > below;
    const maxHeight = Math.max(160, flip ? above : below);
    const top = flip ? Math.max(8, a.top - gap - Math.min(height, maxHeight)) : a.bottom + gap;
    setPos({ top, left, maxHeight });
  }, [anchorRef, align]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => place();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    const observer = typeof ResizeObserver !== 'undefined' && panelRef.current ? new ResizeObserver(() => place()) : null;
    if (observer && panelRef.current) observer.observe(panelRef.current);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      // clicks inside another (nested) popover, e.g. a filter opened from "More filters"
      if (target instanceof Element && target.closest('[data-hig-popover]')) return;
      onOpenChangeRef.current(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        initialFocus.current?.current ??
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>(FOCUSABLE) ??
        panel;
      target.focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
      observer?.disconnect();
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, place, anchorRef]);

  const close = (restoreFocus: boolean) => {
    onOpenChange(false);
    if (restoreFocus) anchorRef.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      close(true);
      return;
    }
    if (event.key === 'Tab' && panelRef.current) {
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      const first = items[0];
      const last = items[items.length - 1];
      if ((!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault();
        close(true);
      }
    }
  };

  if (!open && !keepMounted) return null;
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role={role}
      aria-label={label}
      data-hig-popover=""
      tabIndex={-1}
      hidden={!open}
      onKeyDown={onKeyDown}
      style={
        open
          ? { position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, maxHeight: pos?.maxHeight, visibility: pos ? 'visible' : 'hidden' }
          : undefined
      }
      className={cn(
        'z-[60] min-w-56 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface text-sm text-fg shadow-overlay focus:outline-none',
        open ? 'flex animate-scale-in' : 'hidden',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

/** State + ids for a trigger/popover pair: const p = usePopover(); <button {...p.triggerProps}/> <Popover {...p.popoverProps}>. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const id = `popover-${useId().replace(/:/g, '')}`;
  return {
    open,
    setOpen,
    anchorRef,
    triggerProps: {
      ref: anchorRef,
      'aria-expanded': open,
      'aria-controls': id,
      'aria-haspopup': 'dialog' as const,
      onClick: () => setOpen((v) => !v),
    },
    popoverProps: { open, onOpenChange: setOpen, anchorRef, id },
  };
}
