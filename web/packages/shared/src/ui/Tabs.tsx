import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface TabItem<T extends string = string> {
  value: T;
  label: ReactNode;
  /** small counter after the label */
  count?: number | null;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  /** the tabs (`items` is an alias) */
  tabs?: readonly TabItem<T>[];
  items?: readonly TabItem<T>[];
  value: T;
  /** called with the selected value (`onValueChange` is an alias) */
  onChange?: (value: T) => void;
  onValueChange?: (value: T) => void;
  variant?: 'underline' | 'pills';
  /** prefix for tab / panel ids: tab = `${idPrefix}-tab-${value}`, panel = `${idPrefix}-panel-${value}` */
  idPrefix?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * Accessible tab list (arrow keys / Home / End, roving tabindex). Render the active panel yourself, ideally
 * inside <TabPanel idPrefix=".." value={active}>.
 */
export function Tabs<T extends string = string>({
  tabs,
  items,
  value,
  onChange,
  onValueChange,
  variant = 'underline',
  idPrefix = 'tabs',
  className,
  'aria-label': ariaLabel,
}: TabsProps<T>) {
  const list = tabs ?? items ?? [];
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const select = (next: T) => {
    onChange?.(next);
    onValueChange?.(next);
  };
  const enabled = list.map((tab, index) => ({ tab, index })).filter(({ tab }) => !tab.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key) || enabled.length === 0) return;
    event.preventDefault();
    const currentPos = Math.max(0, enabled.findIndex(({ tab }) => tab.value === value));
    let nextPos: number;
    if (event.key === 'Home') nextPos = 0;
    else if (event.key === 'End') nextPos = enabled.length - 1;
    else {
      const forward = event.key === 'ArrowRight';
      nextPos = (currentPos + (forward ? 1 : -1) + enabled.length) % enabled.length;
    }
    const target = enabled[nextPos];
    if (!target) return;
    select(target.tab.value);
    refs.current[target.index]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        'flex max-w-full gap-1 overflow-x-auto',
        variant === 'underline' ? 'border-b border-border' : 'rounded-xl bg-surface-2 p-1',
        className,
      )}
    >
      {list.map((tab, index) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.value}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${tab.value}`}
            tabIndex={active ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => select(tab.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
              variant === 'underline'
                ? cn('-mb-px border-b-2 px-3 py-2.5', active ? 'border-primary font-semibold text-primary-ink' : 'border-transparent text-muted hover:border-border-strong hover:text-fg')
                : cn('rounded-lg px-3 py-1.5', active ? 'bg-surface text-fg shadow-card ring-1 ring-border' : 'text-muted hover:text-fg'),
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && tab.count !== null && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs tabular-nums',
                  active ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-muted',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  value: string;
  idPrefix?: string;
  className?: string;
  children?: ReactNode;
}

/** Panel linked to the tab with the same `value` / `idPrefix`. */
export function TabPanel({ value, idPrefix = 'tabs', className, children }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${value}`}
      aria-labelledby={`${idPrefix}-tab-${value}`}
      tabIndex={0}
      className={cn('focus-visible:outline-none', className)}
    >
      {children}
    </div>
  );
}
