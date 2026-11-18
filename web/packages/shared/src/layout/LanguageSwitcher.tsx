import { useEffect, useId, useRef, useState } from 'react';
import { Check, Languages } from 'lucide-react';
import { authApi } from '../api/endpoints/auth';
import { tokenStore } from '../api/client';
import { cn } from '../lib/cn';
import { useCommonTranslation, useLanguage } from '../lib/i18n';

export interface LanguageSwitcherProps {
  className?: string;
  /**
   * Save the choice to the signed-in user's profile (`preferred_language`) so emails, notifications and the
   * mobile app follow it too (default true; skipped when nobody is signed in).
   */
  saveToProfile?: boolean;
  /** show the language name next to the icon (default: code only on small screens) */
  showLabel?: boolean;
}

/**
 * Top-bar language menu. Lists only the languages an admin enabled; renders nothing while English is the only
 * one. Each option is written in its own language ("Français", "العربية") with `lang`/`dir` set.
 */
export function LanguageSwitcher({ className, saveToProfile = true, showLabel = false }: LanguageSwitcherProps) {
  const { t } = useCommonTranslation();
  const { language, languages, changeLanguage, loading } = useLanguage();
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

  if (languages.length < 2) return null;
  const active = languages.find((l) => l.code === language);

  const choose = (code: string) => {
    setOpen(false);
    if (code === language) return;
    void changeLanguage(code);
    if (saveToProfile && tokenStore.get()) {
      authApi.updateMe({ preferred_language: code }).catch(() => undefined);
    }
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t('language.label')}
        title={t('language.label')}
        aria-busy={loading || undefined}
        onClick={() => setOpen((v) => !v)}
        data-testid="language-switcher"
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <Languages className="size-5" aria-hidden />
        <span className={cn('text-xs font-semibold uppercase', showLabel && 'hidden')}>{language}</span>
        {showLabel && active && (
          <span className="text-sm" lang={active.code}>
            {active.native_name}
          </span>
        )}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('language.label')}
          className="absolute end-0 z-40 mt-2 w-52 animate-scale-in overflow-hidden rounded-xl border border-border bg-raised py-1 shadow-overlay"
        >
          {languages.map((l) => {
            const selected = l.code === language;
            return (
              <button
                key={l.code}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                lang={l.code}
                dir={l.rtl ? 'rtl' : 'ltr'}
                onClick={() => choose(l.code)}
                className={cn(
                  'flex w-full items-center gap-2 px-4 py-2 text-start text-sm text-fg hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
                  selected && 'font-semibold',
                )}
              >
                <span className="flex-1">{l.native_name}</span>
                {l.native_name !== l.name && (
                  <span className="text-xs text-muted" lang="en" dir="ltr">
                    {l.name}
                  </span>
                )}
                {selected && <Check className="size-4 text-primary" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
