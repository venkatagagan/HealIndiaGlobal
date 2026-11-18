import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { CalendarClock, MapPin } from 'lucide-react';
import { ITINERARY_KIND_LABELS, type ItineraryItemOut, type Uuid } from '@hig/shared/api';
import { DataTable, DateCell, StatusBadgeCell, type DataTableColumn } from '@hig/shared/ui';
import { useAppTranslation } from '../../../i18n';
import { useItinerary } from '../api/queries';
import { cn, formatDateTime } from '../lib/shared';

const mapHref = (i: ItineraryItemOut) =>
  i.lat != null && i.lng != null
    ? `https://www.openstreetmap.org/?mlat=${i.lat}&mlon=${i.lng}#map=17/${i.lat}/${i.lng}`
    : `https://www.openstreetmap.org/search?query=${encodeURIComponent(i.location ?? '')}`;

const columns = (t: TFunction): DataTableColumn<ItineraryItemOut>[] => [
  {
    key: 'starts_at',
    header: t('itinerary.when'),
    sortable: true,
    mobile: 'meta',
    cell: (i) => (
      <DateCell
        value={i.starts_at}
        display="datetime"
        secondary={i.ends_at ? t('itinerary.until', { time: formatDateTime(i.ends_at, 'HH:mm') }) : undefined}
      />
    ),
  },
  {
    key: 'title',
    header: t('itinerary.what'),
    mobile: 'primary',
    className: 'max-w-72',
    cell: (i) => (
      <span className="block min-w-0">
        <span className={cn('block truncate font-medium text-fg', i.status === 'cancelled' && 'line-through opacity-60')}>{i.title}</span>
        <span className="block truncate text-xs text-muted">{i.description ?? ITINERARY_KIND_LABELS[i.kind]}</span>
      </span>
    ),
  },
  {
    key: 'location',
    header: t('itinerary.where'),
    className: 'max-w-56',
    cell: (i) =>
      i.location ? (
        <a
          href={mapHref(i)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex max-w-full items-center gap-1 text-primary-ink hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{i.location}</span>
        </a>
      ) : (
        <span className="text-muted">—</span>
      ),
  },
  {
    key: 'status',
    header: t('itinerary.status'),
    mobile: 'badge',
    cell: (i) => <StatusBadgeCell status={i.status} kind="itinerary" />,
  },
];

/** Compact, sortable itinerary for a booking (case detail). The trip hub keeps its timeline view. */
export function ItineraryTable({ bookingId }: { bookingId: Uuid }) {
  const { t } = useAppTranslation();
  const itinerary = useItinerary(bookingId);
  const cols = useMemo(() => columns(t), [t]);
  return (
    <DataTable
      caption={t('itinerary.caption')}
      columns={cols}
      rows={itinerary.data}
      loading={itinerary.isLoading}
      error={itinerary.error}
      onRetry={() => void itinerary.refetch()}
      defaultSort={{ key: 'starts_at', direction: 'asc' }}
      density="compact"
      responsive="cards"
      showViewOptions={false}
      className="shadow-none"
      emptyIcon={<CalendarClock className="size-7" aria-hidden />}
      emptyTitle={t('itinerary.emptyTitle')}
      emptyDescription={t('itinerary.emptyDescription')}
    />
  );
}
