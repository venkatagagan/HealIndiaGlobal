import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { useCommonTranslation } from '../lib/i18n';

// -----------------------------------------------------------------------------------------------------------
// FormField: label + control + hint + error, with ids wired for screen readers
// -----------------------------------------------------------------------------------------------------------
interface FieldContextValue {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Props a control inside <FormField> inherits (unless it sets its own). */
function useFieldProps(props: {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: ComponentProps<'input'>['aria-invalid'];
  required?: boolean;
  invalid?: boolean;
}) {
  const field = useContext(FieldContext);
  const describedBy = [props['aria-describedby'], field?.describedBy].filter(Boolean).join(' ') || undefined;
  const invalid = props.invalid || field?.invalid || undefined;
  return {
    id: props.id ?? field?.id,
    'aria-describedby': describedBy,
    'aria-invalid': props['aria-invalid'] ?? (invalid ? true : undefined),
    required: props.required ?? (field?.required || undefined),
  };
}

export interface FormFieldProps {
  label?: ReactNode;
  /** id of the control; generated when omitted (controls inside pick it up automatically) */
  id?: string;
  /** alias of `id` */
  htmlFor?: string;
  hint?: ReactNode;
  /** error message (string or node); marks the control aria-invalid */
  error?: ReactNode;
  required?: boolean;
  /** shows "(Optional)" next to the label */
  optional?: boolean;
  className?: string;
  /** visually hide the label (still read by screen readers) */
  hideLabel?: boolean;
  children: ReactNode;
}

export function FormField({
  label,
  id,
  htmlFor,
  hint,
  error,
  required = false,
  optional = false,
  className,
  hideLabel = false,
  children,
}: FormFieldProps) {
  const { t } = useCommonTranslation();
  const generated = useId();
  const controlId = id ?? htmlFor ?? `field-${generated}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <FieldContext.Provider value={{ id: controlId, describedBy, invalid: Boolean(error), required }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        {label !== undefined && label !== null && (
          <label htmlFor={controlId} className={cn('text-sm font-medium text-fg', hideLabel && 'sr-only')}>
            {label}
            {required && (
              <span className="ms-0.5 text-danger" aria-hidden>
                *
              </span>
            )}
            {optional && !required && <span className="ms-1 text-xs font-normal text-muted">({t('form.optional')})</span>}
          </label>
        )}
        {children}
        {hint && !error && (
          <p id={hintId} className="text-xs text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-danger-ink">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

/** Plain label (when not using FormField). */
export function Label({ className, ...rest }: ComponentProps<'label'>) {
  return <label className={cn('text-sm font-medium text-fg', className)} {...rest} />;
}

// -----------------------------------------------------------------------------------------------------------
// Text inputs
// -----------------------------------------------------------------------------------------------------------
const CONTROL =
  'block w-full rounded-lg border border-border bg-surface text-sm text-fg shadow-xs transition-colors ' +
  'placeholder:text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30';

export interface InputProps extends ComponentProps<'input'> {
  /** red border + aria-invalid (also inherited from an erroring FormField) */
  invalid?: boolean;
  /** element inside the field at the start (e.g. an icon) */
  leftAddon?: ReactNode;
  /** element inside the field at the end (e.g. a unit or a button) */
  rightAddon?: ReactNode;
}

export function Input({ className, invalid, leftAddon, rightAddon, id, required, type = 'text', ...rest }: InputProps) {
  const field = useFieldProps({
    id,
    required,
    invalid,
    'aria-describedby': rest['aria-describedby'],
    'aria-invalid': rest['aria-invalid'],
  });
  const input = (
    <input
      type={type}
      {...rest}
      {...field}
      className={cn(CONTROL, 'h-10 px-3', leftAddon && 'ps-9', rightAddon && 'pe-10', !leftAddon && !rightAddon && className)}
    />
  );
  if (!leftAddon && !rightAddon) return input;
  return (
    <div className={cn('relative', className)}>
      {leftAddon && (
        <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted">{leftAddon}</span>
      )}
      {input}
      {rightAddon && <span className="absolute inset-y-0 end-0 flex items-center pe-2 text-muted">{rightAddon}</span>}
    </div>
  );
}

export interface TextareaProps extends ComponentProps<'textarea'> {
  invalid?: boolean;
}

export function Textarea({ className, invalid, id, required, rows = 4, ...rest }: TextareaProps) {
  const field = useFieldProps({
    id,
    required,
    invalid,
    'aria-describedby': rest['aria-describedby'],
    'aria-invalid': rest['aria-invalid'],
  });
  return <textarea rows={rows} {...rest} {...field} className={cn(CONTROL, 'min-h-20 px-3 py-2', className)} />;
}

// -----------------------------------------------------------------------------------------------------------
// Select (native, accessible on every platform)
// -----------------------------------------------------------------------------------------------------------
export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends ComponentProps<'select'> {
  /** rendered as <option>s (children are rendered too, after them) */
  options?: readonly SelectOption[];
  /** first, empty option (value "") */
  placeholder?: string;
  invalid?: boolean;
}

export function Select({ className, options, placeholder, invalid, id, required, children, ...rest }: SelectProps) {
  const field = useFieldProps({
    id,
    required,
    invalid,
    'aria-describedby': rest['aria-describedby'],
    'aria-invalid': rest['aria-invalid'],
  });
  return (
    <div className={cn('relative', className)}>
      <select {...rest} {...field} className={cn(CONTROL, 'h-10 cursor-pointer appearance-none ps-3 pe-9')}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

// -----------------------------------------------------------------------------------------------------------
// Checkbox & Switch
// -----------------------------------------------------------------------------------------------------------
export interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type'> {
  label?: ReactNode;
  description?: ReactNode;
  /** visual "mixed" state */
  indeterminate?: boolean;
  invalid?: boolean;
}

export function Checkbox({ label, description, indeterminate = false, invalid, className, id, ref, ...rest }: CheckboxProps) {
  const generated = useId();
  const field = useContext(FieldContext);
  const inputId = id ?? (label ? `checkbox-${generated}` : field?.id);
  const descriptionId = description ? `${inputId ?? generated}-description` : undefined;
  const localRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (localRef.current) localRef.current.indeterminate = indeterminate;
  }, [indeterminate]);
  const box = (
    <input
      type="checkbox"
      {...rest}
      id={inputId}
      ref={(node) => {
        localRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      aria-describedby={[rest['aria-describedby'], descriptionId, field?.describedBy].filter(Boolean).join(' ') || undefined}
      aria-invalid={rest['aria-invalid'] ?? (invalid || field?.invalid ? true : undefined)}
      className={cn(
        'mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border accent-primary',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        !label && className,
      )}
    />
  );
  if (!label) return box;
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      {box}
      <div className="min-w-0 text-sm">
        <label htmlFor={inputId} className="cursor-pointer font-medium text-fg">
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-xs text-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

export interface SwitchProps {
  checked: boolean;
  /** called with the new value (`onChange` is an alias) */
  onCheckedChange?: (checked: boolean) => void;
  onChange?: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  name?: string;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}

/** Toggle switch (`role="switch"`), keyboard accessible (Space / Enter). */
export function Switch({
  checked,
  onCheckedChange,
  onChange,
  label,
  description,
  disabled = false,
  id,
  name,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: SwitchProps) {
  const generated = useId();
  const switchId = id ?? `switch-${generated}`;
  const descriptionId = description ? `${switchId}-description` : undefined;
  const toggle = () => {
    if (disabled) return;
    onCheckedChange?.(!checked);
    onChange?.(!checked);
  };
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const thumb = size === 'sm' ? 'size-4' : 'size-5';
  const shift = size === 'sm' ? 'translate-x-4' : 'translate-x-5';
  const control = (
    <button
      type="button"
      role="switch"
      id={switchId}
      name={name}
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={toggle}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-primary' : 'bg-border-strong',
        track,
        !label && className,
      )}
    >
      <span
        aria-hidden
        className={cn('pointer-events-none inline-block rounded-full bg-white shadow transition-transform', thumb, checked ? shift : 'translate-x-0')}
      />
    </button>
  );
  if (!label) return control;
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="min-w-0 text-sm">
        <label htmlFor={switchId} className="cursor-pointer font-medium text-fg">
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-xs text-muted">
            {description}
          </p>
        )}
      </div>
      {control}
    </div>
  );
}

// -----------------------------------------------------------------------------------------------------------
// SearchInput
// -----------------------------------------------------------------------------------------------------------
export interface SearchInputProps
  extends Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'size'> {
  /** controlled value; omit for uncontrolled */
  value?: string;
  defaultValue?: string;
  /** every keystroke (string value) */
  onChange?: (value: string) => void;
  /** debounced by `debounceMs` (default 300) and on Enter; use for API queries */
  onSearch?: (value: string) => void;
  debounceMs?: number;
  /** accessible label (default "Search") */
  label?: string;
}

export function SearchInput({
  value,
  defaultValue = '',
  onChange,
  onSearch,
  debounceMs = 300,
  label,
  placeholder,
  className,
  onKeyDown,
  ...rest
}: SearchInputProps) {
  const { t } = useCommonTranslation();
  const [inner, setInner] = useState(value ?? defaultValue);
  const current = value ?? inner;
  const onSearchRef = useRef(onSearch);
  useEffect(() => {
    onSearchRef.current = onSearch;
  });
  const lastSearched = useRef(current);

  useEffect(() => {
    if (!onSearchRef.current || current === lastSearched.current) return;
    const handle = setTimeout(() => {
      lastSearched.current = current;
      onSearchRef.current?.(current);
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [current, debounceMs]);

  const update = (next: string) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === 'Enter' && onSearch) {
      event.preventDefault();
      lastSearched.current = current;
      onSearch(current);
    } else if (event.key === 'Escape' && current) {
      event.preventDefault();
      update('');
    }
  };

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        role="searchbox"
        aria-label={rest['aria-label'] ?? label ?? t('actions.search')}
        placeholder={placeholder ?? `${t('actions.search')}…`}
        {...rest}
        value={current}
        onChange={(e) => update(e.target.value)}
        onKeyDown={handleKeyDown}
        className={cn(CONTROL, 'h-10 ps-9 pe-9 [&::-webkit-search-cancel-button]:appearance-none')}
      />
      {current && (
        <button
          type="button"
          onClick={() => {
            update('');
            if (onSearch) {
              lastSearched.current = '';
              onSearch('');
            }
          }}
          className="absolute end-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('actions.clear')}
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
