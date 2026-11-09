'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Calculator,
  ChevronDown,
  CircleCheck,
  Handshake,
  HeartHandshake,
  Hospital,
  Luggage,
  MapPin,
  Menu,
  Newspaper,
  PhoneCall,
  ShieldCheck,
  Sparkles,
  Stamp,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { NavData, NavGroupId, NavLink, NavSpecialty, NavStep } from '@/lib/nav';
import { BrandIcon } from './brand-icons';
import { SpecialtyIcon } from './specialty-icon';

const OPEN_DELAY = 110;
const CLOSE_DELAY = 260;
const GROUPS: NavGroupId[] = ['treatments', 'hospitals', 'doctors', 'trip', 'partners'];

/** Closes the menu after client-side navigation (link clicks inside the menu also close it directly). */
function useOnNavigate(close: () => void) {
  const key = usePathname();
  const last = useRef(key);
  useEffect(() => {
    if (last.current !== key) {
      last.current = key;
      close();
    }
  }, [key, close]);
}

/** Filter deep links (?city=, ?specialty=, ?accreditation=) need a full load so the list reads its preset. */
function MenuLink({ href, className, children, title }: { href: string; className?: string; children: ReactNode; title?: string }) {
  if (href.includes('?') || /^https?:/.test(href)) {
    return (
      <a href={href} className={className} title={title}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} title={title}>
      {children}
    </Link>
  );
}

function groupTitle(data: NavData, id: NavGroupId): string {
  const l = data.labels;
  return { treatments: l.treatments, hospitals: l.hospitals, doctors: l.doctors, trip: l.trip, partners: l.partners }[id];
}

// ----------------------------------------------------------------------------------------- design primitives
// One accent per element (DESIGN.md): navy text, teal for icons/actions, champagne only as hairlines.
const ITEM =
  'group/item -mx-2 flex items-center gap-2.5 rounded-md px-2 py-[0.4375rem] text-[0.9375rem] font-medium whitespace-nowrap text-slate-900 transition-colors hover:bg-cloud hover:text-primary-700';
const ICON = 'h-[1.125rem] w-[1.125rem] shrink-0 text-primary-600';

function Label({ children }: { children: ReactNode }) {
  return <span className="block text-[0.8125rem] font-semibold tracking-[0.06em] text-slate-600 uppercase">{children}</span>;
}

function Heading({ label, title, lead }: { label: string; title: string; lead?: string }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-[0.8125rem] font-semibold tracking-[0.06em] text-slate-600 uppercase">
        <span aria-hidden="true" className="h-px w-5 bg-champagne" />
        {label}
      </p>
      <p className="font-display mt-1.5 text-[1.375rem] leading-tight font-semibold text-slate-900">{title}</p>
      {lead ? <p className="mt-1 text-[0.9375rem] text-slate-600">{lead}</p> : null}
    </div>
  );
}

function TextAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <MenuLink href={href} className="group/a inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold whitespace-nowrap text-primary-700 hover:text-primary-800">
      <span className="underline-offset-4 group-hover/a:underline">{children}</span>
      <ArrowRight className="h-4 w-4 transition-transform group-hover/a:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
    </MenuLink>
  );
}

function SpecialtyItem({ s }: { s: NavSpecialty }) {
  return (
    <MenuLink href={s.href} className={ITEM} title={s.name}>
      <SpecialtyIcon slug={s.slug} icon={s.icon} className={ICON} />
      {s.label}
    </MenuLink>
  );
}

function Initials({ text }: { text: string }) {
  return (
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-[0.8125rem] font-semibold text-white">
      {text}
    </span>
  );
}

const STEP_ICONS: Record<NavStep['icon'], LucideIcon> = { pre: Luggage, visa: Stamp, india: Hospital, after: HeartHandshake };
const TRIP_LINK_ICONS: LucideIcon[] = [Calculator, Newspaper, Wallet, BookOpen];

// ------------------------------------------------------------------------------------------------- panels
function TreatmentsPanel({ data }: { data: NavData }) {
  const l = data.labels;
  return (
    <>
      <div className="flex items-end justify-between gap-8 px-8 pt-7">
        <Heading label={l.treatments} title={l.exploreSpecialties} lead={data.savingsLine || undefined} />
        <div className="flex shrink-0 items-center gap-6">
          <TextAction href={data.links.costs}>{l.compareCosts}</TextAction>
          <TextAction href={data.links.treatments}>{l.allTreatments}</TextAction>
        </div>
      </div>
      <div className="mx-8 mt-5 grid grid-cols-4 gap-x-8 border-t border-champagne/30 pt-5 pb-6">
        {data.specialtyGroups.map((g) => (
          <div key={g.title}>
            <Label>{g.title}</Label>
            <ul className="mt-2">
              {g.items.slice(0, 8).map((s) => (
                <li key={s.slug}>
                  <SpecialtyItem s={s} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {data.popular.length ? (
        <div className="flex items-center gap-x-6 gap-y-1 rounded-b-xl border-t border-slate-200 bg-cloud px-8 py-3.5">
          <Label>{l.popularShort}</Label>
          <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-1">
            {data.popular.map((p) => (
              <li key={p.href}>
                <Link href={p.href} className="text-[0.9375rem] font-medium whitespace-nowrap text-slate-900 hover:text-primary-700 hover:underline">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
          <a href={data.links.assessment} className="inline-flex shrink-0 items-center gap-1.5 text-[0.9375rem] font-semibold text-primary-700 hover:text-primary-800">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {l.assessment}
          </a>
        </div>
      ) : null}
    </>
  );
}

function HospitalsPanel({ data }: { data: NavData }) {
  const l = data.labels;
  return (
    <div className="px-8 py-7">
      <div className="flex items-end justify-between gap-8">
        <Heading label={l.hospitals} title={l.featuredHospitals} lead={l.hospitalsLead} />
        <TextAction href={data.links.hospitals}>{l.allHospitals}</TextAction>
      </div>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_14rem_14rem] gap-x-10 border-t border-champagne/30 pt-5">
        <ul className="space-y-3">
          {data.featuredHospitals.map((h) => (
            <li key={h.href}>
              <Link href={h.href} className="group flex items-center gap-3.5 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-primary-300">
                <Initials text={h.initials} />
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] font-semibold whitespace-nowrap text-slate-900 group-hover:text-primary-700">{h.label}</span>
                  <span className="flex items-center gap-1.5 text-sm whitespace-nowrap text-slate-600">
                    {h.city.split(',')[0]}
                    {h.accreditations.length ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <BadgeCheck className="h-4 w-4 text-primary-600" aria-hidden="true" />
                        {h.accreditations.slice(0, 2).join(', ')}
                      </>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div>
          <Label>{l.byCity}</Label>
          <ul className="mt-2 grid grid-cols-2 gap-x-4">
            {data.cities.slice(0, 8).map((c) => (
              <li key={c.href}>
                <MenuLink href={c.href} className={ITEM}>
                  {c.label}
                </MenuLink>
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <TextAction href={data.links.destinations}>{l.allDestinations}</TextAction>
          </div>
        </div>
        <div>
          <Label>{l.quickFilters}</Label>
          <ul className="mt-2">
            {[...data.hospitalFilters, ...data.hospitalSpecialties.slice(0, 4)].map((f, i) => (
              <li key={f.href}>
                <MenuLink href={f.href} className={ITEM}>
                  {i < data.hospitalFilters.length ? <ShieldCheck className={ICON} aria-hidden="true" /> : <span aria-hidden="true" className="w-[1.125rem]" />}
                  {f.label}
                </MenuLink>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function DoctorsPanel({ data }: { data: NavData }) {
  const l = data.labels;
  const list = data.doctorSpecialties.slice(0, 16);
  const half = Math.ceil(list.length / 2);
  return (
    <div className="px-8 py-7">
      <div className="flex items-end justify-between gap-8">
        <Heading label={l.doctors} title={l.findDoctor} lead={l.doctorsLead} />
        <TextAction href={data.links.doctors}>{l.allDoctors}</TextAction>
      </div>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_19rem] gap-x-10 border-t border-champagne/30 pt-5">
        {[list.slice(0, half), list.slice(half)].map((col, i) => (
          <ul key={i}>
            {col.map((s) => (
              <li key={s.slug}>
                <SpecialtyItem s={s} />
              </li>
            ))}
          </ul>
        ))}
        <div>
          <Label>{l.topRated}</Label>
          <ul className="mt-2 space-y-3">
            {data.featuredDoctors.map((d) => (
              <li key={d.href}>
                <Link href={d.href} className="group flex items-center gap-3.5 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:border-primary-300">
                  <Initials text={d.initials} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-[0.9375rem] font-semibold whitespace-nowrap text-slate-900 group-hover:text-primary-700">
                      {d.label}
                      {d.badge ? (
                        <>
                          <BadgeCheck className="h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
                          <span className="sr-only">{d.badge}</span>
                        </>
                      ) : null}
                    </span>
                    <span className="block text-sm whitespace-nowrap text-slate-600">{[d.specialty, d.years].filter(Boolean).join(' · ')}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function TripPanel({ data }: { data: NavData }) {
  const l = data.labels;
  const c = data.contact;
  return (
    <div className="px-8 py-7">
      <div className="flex items-end justify-between gap-8">
        <Heading label={l.trip} title={l.tripSteps} />
        <TextAction href={data.links.assessment}>{l.assessment}</TextAction>
      </div>
      <ol className="mt-5 grid grid-cols-4 gap-x-6 border-t border-champagne/30 pt-5">
        {data.steps.map((s) => {
          const Icon = STEP_ICONS[s.icon];
          return (
            <li key={s.href}>
              <Link href={s.href} className="group -mx-2 block rounded-md px-2 py-1.5 hover:bg-cloud">
                <span className="flex items-center gap-2 text-[0.8125rem] font-semibold tracking-[0.06em] text-slate-600 uppercase">
                  <Icon className={ICON} aria-hidden="true" />
                  {s.step}
                </span>
                <span className="mt-1 block text-[0.9375rem] font-semibold text-slate-900 group-hover:text-primary-700">{s.label}</span>
                {s.meta ? <span className="block text-sm text-slate-600">{s.meta}</span> : null}
              </Link>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_14rem_15rem] gap-x-10 border-t border-slate-200 pt-5">
        <div>
          <Label>{l.destinations}</Label>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            {data.destinations.map((d) => (
              <li key={d.href}>
                <Link href={d.href} title={d.meta} className="inline-flex items-center gap-1.5 py-1 text-[0.9375rem] font-medium whitespace-nowrap text-slate-900 hover:text-primary-700 hover:underline">
                  <MapPin className="h-4 w-4 text-primary-600" aria-hidden="true" />
                  {d.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <Label>{l.usefulLinks}</Label>
          <ul className="mt-2">
            {data.tripLinks.slice(0, 3).map((t, i) => {
              const Icon = TRIP_LINK_ICONS[i % TRIP_LINK_ICONS.length]!;
              return (
                <li key={t.href}>
                  <Link href={t.href} className={ITEM}>
                    <Icon className={ICON} aria-hidden="true" />
                    {t.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          {c.whatsapp || c.phone ? (
            <>
              <Label>{l.coordinatorTitle}</Label>
              <ul className="mt-2">
                {c.whatsapp ? (
                  <li>
                    <a href={`https://wa.me/${c.whatsapp}?text=${encodeURIComponent(c.message)}`} target="_blank" rel="noopener noreferrer" className={ITEM}>
                      <BrandIcon name="whatsapp" className={ICON} />
                      {l.chatWhatsapp}
                    </a>
                  </li>
                ) : null}
                {c.phone ? (
                  <li>
                    <a href={`tel:${c.phone}`} className={ITEM}>
                      <PhoneCall className={ICON} aria-hidden="true" />
                      {c.phoneDisplay || l.callUs}
                    </a>
                  </li>
                ) : null}
              </ul>
            </>
          ) : (
            <>
              <Label>{l.ctaEyebrow}</Label>
              <ul className="mt-2 space-y-1.5">
                {l.assessmentPoints.map((pt) => (
                  <li key={pt} className="flex items-center gap-2.5 text-[0.9375rem] whitespace-nowrap text-slate-700">
                    <CircleCheck className={ICON} aria-hidden="true" />
                    {pt.replace(/ - .*$/, '')}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PartnersPanel({ data }: { data: NavData }) {
  const l = data.labels;
  const icons = { hospitals: Hospital, agents: Handshake } as const;
  return (
    <div className="px-8 py-7">
      <Heading label={l.partners} title={l.partnerWithUs} />
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_12rem] gap-x-10 border-t border-champagne/30 pt-5">
        {data.partners.map((p) => {
          const Icon = icons[p.id];
          return (
            <div key={p.id}>
              <p className="flex items-center gap-2.5 text-[1.0625rem] font-semibold text-slate-900">
                <Icon className="h-5 w-5 text-primary-600" aria-hidden="true" />
                {p.title}
              </p>
              <p className="mt-1 text-[0.9375rem] text-slate-600">{p.body}</p>
              <ul className="mt-3 space-y-1.5">
                {p.benefits.map((b) => (
                  <li key={b} className="flex items-center gap-2.5 text-[0.9375rem] whitespace-nowrap text-slate-800">
                    <CircleCheck className="h-4 w-4 shrink-0 text-primary-600" aria-hidden="true" />
                    {b}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center gap-5">
                <MenuLink href={p.cta.href} className="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-[0.9375rem] font-semibold text-white hover:bg-primary-700">
                  {p.cta.label}
                </MenuLink>
                <TextAction href={p.href}>{l.learnMore}</TextAction>
              </div>
            </div>
          );
        })}
        <div>
          <Label>{l.company}</Label>
          <ul className="mt-2">
            {data.company.map((c) => (
              <li key={c.href}>
                <Link href={c.href} className={ITEM}>
                  {c.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

const PANELS: Record<NavGroupId, (props: { data: NavData }) => ReactNode> = {
  treatments: TreatmentsPanel,
  hospitals: HospitalsPanel,
  doctors: DoctorsPanel,
  trip: TripPanel,
  partners: PartnersPanel,
};

// --------------------------------------------------------------------------------------------- desktop menu
/**
 * Desktop navigation: each top-level item opens its OWN mega panel (about 70% of the viewport, centred, sized to fit
 * without scrolling). Hover intent with delays; click/Enter/Space toggle; ArrowLeft/Right move between items;
 * ArrowDown/Tab enter the open panel; Escape closes and returns focus; outside click and navigation close it.
 * Panels stay in the DOM (hidden with `invisible`) so their links are crawlable and opening causes no layout shift.
 * No page scrim: the panel is a crisp white sheet with a hairline border and a soft shadow.
 */
export function MegaMenu({ data }: { data: NavData }) {
  const baseId = useId();
  const [active, setActive] = useState<NavGroupId | null>(null);
  const triggersRef = useRef<HTMLUListElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const open = active !== null;
  const panelId = (id: NavGroupId) => `${baseId}-${id}`;

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  const close = useCallback(() => {
    clear();
    setActive(null);
  }, []);
  const schedule = (fn: () => void, ms: number) => {
    clear();
    timer.current = setTimeout(fn, ms);
  };

  useOnNavigate(close);
  useEffect(() => clear, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggersRef.current?.contains(target) || panelsRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const trigger = triggersRef.current?.querySelector<HTMLButtonElement>(`[data-group="${active}"]`);
      close();
      trigger?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, active, close]);

  const focusPanel = (id: NavGroupId) => {
    // Wait a frame so the panel is visible (and therefore focusable).
    requestAnimationFrame(() => document.getElementById(panelId(id))?.querySelector<HTMLElement>('a[href]')?.focus());
  };

  const onTriggerKey = (id: NavGroupId) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey && active === id)) {
      e.preventDefault();
      setActive(id);
      focusPanel(id);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const i = GROUPS.indexOf(id);
      const next = GROUPS[(i + (e.key === 'ArrowRight' ? 1 : GROUPS.length - 1)) % GROUPS.length]!;
      triggersRef.current?.querySelector<HTMLButtonElement>(`[data-group="${next}"]`)?.focus();
      if (open) setActive(next);
    }
  };

  // Close when focus leaves both the triggers and the panels (keyboard users tabbing on).
  const onBlur = (e: React.FocusEvent) => {
    const next = e.relatedTarget as Node | null;
    if (!next) return;
    if (triggersRef.current?.contains(next) || panelsRef.current?.contains(next)) return;
    close();
  };

  return (
    <nav aria-label={data.labels.main} className="ms-6 hidden lg:block" onBlur={onBlur}>
      <ul
        ref={triggersRef}
        className="flex items-center gap-1"
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse' && open) schedule(close, CLOSE_DELAY);
        }}
      >
        {GROUPS.map((id) => (
          <li key={id}>
            <button
              type="button"
              data-group={id}
              aria-expanded={active === id}
              aria-controls={panelId(id)}
              onClick={() => (active === id ? close() : (clear(), setActive(id)))}
              onKeyDown={onTriggerKey(id)}
              onPointerEnter={(e) => {
                if (e.pointerType !== 'mouse') return;
                if (open) {
                  clear();
                  setActive(id);
                } else schedule(() => setActive(id), OPEN_DELAY);
              }}
              className={`relative inline-flex items-center gap-1 rounded-md px-3 py-2 text-[0.9375rem] font-semibold transition-colors after:absolute after:inset-x-3 after:-bottom-[0.6875rem] after:h-0.5 after:transition-colors hover:text-primary-700 ${
                active === id ? 'text-primary-700 after:bg-champagne' : 'text-slate-900 after:bg-transparent'
              }`}
            >
              {groupTitle(data, id)}
              <ChevronDown
                className={`h-4 w-4 text-slate-500 transition-transform motion-reduce:transition-none ${active === id ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>

      <div
        ref={panelsRef}
        onPointerEnter={(e) => e.pointerType === 'mouse' && clear()}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse') schedule(close, CLOSE_DELAY);
        }}
        onClick={(e) => {
          if ((e.target as Element).closest('a')) close();
        }}
      >
        {GROUPS.map((id) => {
          const Panel = PANELS[id];
          const shown = active === id;
          return (
            <div
              key={id}
              id={panelId(id)}
              role="region"
              aria-label={groupTitle(data, id)}
              className={`absolute top-[calc(100%+0.5rem)] left-1/2 w-[min(calc(100vw-2rem),max(70vw,64rem))] max-w-[75rem] -translate-x-1/2 transition duration-150 ease-out motion-reduce:transition-none ${
                shown ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0'
              }`}
            >
              <div className="max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white text-slate-900 shadow-[0_24px_48px_-12px_rgb(16_42_67/0.18)]">
                <Panel data={data} />
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------------------------- mobile drawer
const M_ITEM = 'flex items-center gap-3 rounded-md px-1 py-2.5 text-[0.9375rem] font-medium text-slate-900 active:bg-cloud';

function MobileList({ links }: { links: NavLink[] }) {
  return (
    <ul>
      {links.map((l) => (
        <li key={l.href}>
          <MenuLink href={l.href} className={M_ITEM}>
            {l.label}
          </MenuLink>
        </li>
      ))}
    </ul>
  );
}

function MobileAll({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-2 px-1">
      <TextAction href={href}>{label}</TextAction>
    </div>
  );
}

function MobileSection({ id, data }: { id: NavGroupId; data: NavData }) {
  const l = data.labels;
  switch (id) {
    case 'treatments':
      return (
        <>
          <ul className="grid grid-cols-2 gap-x-3">
            {data.specialties.map((s) => (
              <li key={s.slug}>
                <Link href={s.href} className={M_ITEM}>
                  <SpecialtyIcon slug={s.slug} icon={s.icon} className={ICON} />
                  <span className="leading-tight">{s.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-6">
            <MobileAll href={data.links.treatments} label={l.allTreatments} />
            <MobileAll href={data.links.costs} label={l.compareCosts} />
          </div>
        </>
      );
    case 'hospitals':
      return (
        <>
          <p className="px-1 text-sm text-slate-600">{l.hospitalsLead}</p>
          <ul className="mt-1 grid grid-cols-2 gap-x-3">
            {[...data.hospitalFilters, ...data.cities.slice(0, 8)].map((c, i) => (
              <li key={c.href}>
                <MenuLink href={c.href} className={M_ITEM}>
                  {i < data.hospitalFilters.length ? <ShieldCheck className={ICON} aria-hidden="true" /> : null}
                  {c.label}
                </MenuLink>
              </li>
            ))}
          </ul>
          <MobileAll href={data.links.hospitals} label={l.allHospitals} />
        </>
      );
    case 'doctors':
      return (
        <>
          <p className="px-1 text-sm text-slate-600">{l.doctorsLead}</p>
          <ul className="mt-1 grid grid-cols-2 gap-x-3">
            {data.doctorSpecialties.map((s) => (
              <li key={s.slug}>
                <MenuLink href={s.href} className={M_ITEM}>
                  <SpecialtyIcon slug={s.slug} icon={s.icon} className={ICON} />
                  <span className="leading-tight">{s.label}</span>
                </MenuLink>
              </li>
            ))}
          </ul>
          <MobileAll href={data.links.doctors} label={l.allDoctors} />
        </>
      );
    case 'trip':
      return (
        <>
          <ol>
            {data.steps.map((s) => {
              const Icon = STEP_ICONS[s.icon];
              return (
                <li key={s.href}>
                  <Link href={s.href} className={M_ITEM}>
                    <Icon className={ICON} aria-hidden="true" />
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 px-1">
            <Label>{l.destinations}</Label>
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-4 px-1">
            {data.destinations.map((d) => (
              <li key={d.href}>
                <Link href={d.href} className="inline-block py-2 text-[0.9375rem] font-medium text-slate-900">
                  {d.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <MobileList links={data.tripLinks.slice(0, 3)} />
          </div>
          {data.contact.whatsapp || data.contact.phone ? (
            <ul className="mt-1 border-t border-slate-100 pt-1">
              {data.contact.whatsapp ? (
                <li>
                  <a
                    href={`https://wa.me/${data.contact.whatsapp}?text=${encodeURIComponent(data.contact.message)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={M_ITEM}
                  >
                    <BrandIcon name="whatsapp" className={ICON} />
                    {l.chatWhatsapp}
                  </a>
                </li>
              ) : null}
              {data.contact.phone ? (
                <li>
                  <a href={`tel:${data.contact.phone}`} className={M_ITEM}>
                    <PhoneCall className={ICON} aria-hidden="true" />
                    {data.contact.phoneDisplay || l.callUs}
                  </a>
                </li>
              ) : null}
            </ul>
          ) : null}
        </>
      );
    case 'partners':
      return (
        <>
          <ul>
            {data.partners.map((p) => (
              <li key={p.id}>
                <Link href={p.href} className="block rounded-md px-1 py-2.5">
                  <span className="block text-[0.9375rem] font-semibold text-slate-900">{p.title}</span>
                  <span className="block text-sm text-slate-600">{p.body}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-1 border-t border-slate-100 pt-1">
            <MobileList links={data.company} />
          </div>
        </>
      );
  }
}

/**
 * Mobile/tablet navigation: a full-height drawer (portalled to <body> so the sticky header does not clip it) with one
 * accordion per top-level item (one open at a time), each with its own condensed content.
 */
export function MobileNav({ data, footer }: { data: NavData; footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<NavGroupId | null>('treatments');
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerId = useId();
  const l = data.labels;

  const close = useCallback(() => setOpen(false), []);
  useOnNavigate(close);
  // Portals need document.body, which only exists after hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onResize = () => window.matchMedia('(min-width: 64rem)').matches && setOpen(false);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const drawer = (
    <div
      id={drawerId}
      role="dialog"
      aria-modal="true"
      aria-label={l.main}
      className={`fixed inset-0 z-[60] flex flex-col bg-white text-slate-900 transition duration-200 motion-reduce:transition-none lg:hidden ${
        open ? 'visible translate-x-0 opacity-100' : 'invisible translate-x-4 opacity-0'
      }`}
      onClick={(e) => {
        if ((e.target as Element).closest('a')) close();
      }}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-champagne/40 px-4">
        <p className="font-display text-base font-semibold">{l.menuTitle}</p>
        <button
          ref={closeRef}
          type="button"
          onClick={() => {
            close();
            buttonRef.current?.focus();
          }}
          className="flex h-10 w-10 items-center justify-center rounded-md text-slate-900 hover:bg-cloud"
          aria-label={l.closeMenu}
        >
          <X className="h-6 w-6" aria-hidden="true" />
        </button>
      </div>
      <nav aria-label={l.main} className="flex-1 overflow-y-auto overscroll-contain px-4 py-1">
        <ul className="divide-y divide-slate-200">
          {GROUPS.map((id) => {
            const isOpen = section === id;
            const panel = `${drawerId}-${id}`;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panel}
                  onClick={() => setSection(isOpen ? null : id)}
                  className="flex w-full items-center justify-between py-4 text-start text-base font-semibold text-slate-900"
                >
                  {groupTitle(data, id)}
                  <ChevronDown className={`h-5 w-5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                <div id={panel} hidden={!isOpen} className="pb-4">
                  <MobileSection id={id} data={data} />
                </div>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="shrink-0 space-y-2 border-t border-slate-200 bg-cloud px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <a href={data.links.assessment} className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 font-semibold text-white hover:bg-primary-700">
          {l.assessment}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
        {footer}
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={drawerId}
        aria-label={l.openMenu}
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-md text-slate-900 hover:bg-cloud lg:hidden"
      >
        <Menu className="h-6 w-6" aria-hidden="true" />
      </button>
      {mounted ? createPortal(drawer, document.body) : null}
    </>
  );
}
