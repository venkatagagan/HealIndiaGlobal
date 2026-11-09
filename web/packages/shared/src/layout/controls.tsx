import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Bell, ChevronDown, LogOut, Moon, Sun } from 'lucide-react';
import { USER_ROLE_LABELS, type UserRole } from '../api/enums';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';
import { useTheme } from '../lib/theme';
import { Avatar } from '../ui/display';

/** Light / dark toggle (persists the preference; see lib/theme). */
export function ThemeToggle({ className }: { className?: string }) {
  const { isDark, toggle } = useTheme();
  const { t } = useCommonTranslation();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('theme.toggle')}
      aria-pressed={isDark}
      title={isDark ? t('theme.light') : t('theme.dark')}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {isDark ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}

export interface NotificationBellProps {
  /** router path of the notifications page */
  to: string;
  /** unread notifications (0 / undefined: no counter) */
  count?: number | null;
  className?: string;
}

/** Top-bar bell linking to the notifications page, with an unread counter. */
export function NotificationBell({ to, count, className }: NotificationBellProps) {
  const unread = count ?? 0;
  return (
    <Link
      to={to}
      aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      title="Notifications"
      className={cn(
        'relative inline-flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      <Bell className="size-5" aria-hidden />
      {unread > 0 && (
        <span
          className="absolute -end-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-danger-strong px-1 text-[10px] font-bold leading-none text-white tabular-nums"
          aria-hidden
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}

export interface UserMenuUser {
  name: string;
  email?: string | null;
  role?: UserRole | string | null;
  avatarUrl?: string | null;
}

export interface UserMenuProps {
  user: UserMenuUser;
  onLogout?: () => void;
  /** extra menu entries (links / buttons) rendered above "Sign out" */
  children?: ReactNode;
  className?: string;
}

/** Avatar button with a small account menu (Escape / outside click closes it). */
export function UserMenu({ user, onLogout, children, className }: UserMenuProps) {
  const { t } = useCommonTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const roleLabel = user.role
    ? t(`roles.${user.role}`, { defaultValue: (USER_ROLE_LABELS as Record<string, string>)[user.role] ?? user.role })
    : null;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t('layout.userMenu')}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg p-1 text-start transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar name={user.name} src={user.avatarUrl} size="sm" />
        <span className="hidden min-w-0 leading-tight md:block">
          <span className="block max-w-40 truncate text-sm font-medium text-fg">{user.name}</span>
          {roleLabel && <span className="block max-w-40 truncate text-xs text-muted">{roleLabel}</span>}
        </span>
        <ChevronDown className="hidden size-4 text-muted md:block" aria-hidden />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="absolute end-0 z-40 mt-2 w-64 animate-scale-in overflow-hidden rounded-xl border border-border bg-raised shadow-overlay"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium text-fg">{user.name}</p>
            {user.email && <p className="truncate text-xs text-muted">{user.email}</p>}
          </div>
          {children && (
            <div className="border-b border-border py-1" onClick={() => setOpen(false)}>
              {children}
            </div>
          )}
          {onLogout && (
            <div className="py-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className="flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
              >
                <LogOut className="size-4 text-muted" aria-hidden />
                {t('actions.signOut')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
