/**
 * Legal holds: accounts and cases whose data must be kept (erasure requests and retention purges skip them).
 * Placing a hold needs a reason (matter or request reference); lifting one asks for a reason too, which lands
 * in the audit log. API: GET /admin/privacy/legal-holds, PUT /admin/privacy/legal-holds/{users|cases}/{id}.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Gavel, Lock, Unlock } from 'lucide-react';
import { adminApi, casesApi } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { formatDateTime, useDebouncedValue } from '../../lib/format';
import { useOpsMutation } from '../../lib/mutations';
import { opsPaths } from '../../lib/paths';
import {
  LEGAL_HOLD_MIN_REASON,
  privacyToolsApi,
  privacyToolsKeys,
  type LegalHoldEntity,
  type LegalHoldOut,
} from '../../lib/privacyToolsApi';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, Modal, ReasonDialog, Select, Textarea, type Column } from '../../ui';

export function LegalHoldsPanel() {
  const { t } = useAppTranslation();
  const holds = useQuery({ queryKey: privacyToolsKeys.holds, queryFn: privacyToolsApi.legalHolds });
  const [placing, setPlacing] = useState(false);
  const [lifting, setLifting] = useState<LegalHoldOut | null>(null);

  const lift = useOpsMutation({
    mutationFn: (v: { hold: LegalHoldOut; reason: string }) =>
      privacyToolsApi.setLegalHold(v.hold.entity_type, v.hold.entity_id, { legal_hold: false, reason: v.reason }),
    success: (h) => t('privacyTools.holds.lifted', { label: h.label }),
    invalidate: [privacyToolsKeys.holds],
    onSuccess: () => setLifting(null),
  });

  const columns: Column<LegalHoldOut>[] = [
    {
      key: 'type',
      header: t('privacyTools.holds.columns.type'),
      cell: (h) => <Badge tone={h.entity_type === 'case' ? 'violet' : 'blue'}>{t(`privacyTools.holds.entity.${h.entity_type}`)}</Badge>,
    },
    {
      key: 'label',
      header: t('privacyTools.holds.columns.target'),
      cell: (h) =>
        h.entity_type === 'case' ? (
          <Link to={opsPaths.case(h.entity_id)} className="font-medium text-primary-ink hover:underline">
            {h.label}
          </Link>
        ) : (
          <span className="font-medium">{h.label}</span>
        ),
    },
    { key: 'reason', header: t('privacyTools.holds.columns.reason'), cell: (h) => <span className="whitespace-pre-line">{h.reason ?? '—'}</span> },
    { key: 'since', header: t('privacyTools.holds.columns.since'), cell: (h) => formatDateTime(h.set_at), hideOnMobile: true },
    {
      key: 'actions',
      header: <span className="sr-only">{t('privacyTools.holds.columns.actions')}</span>,
      align: 'right',
      cell: (h) => (
        <Button size="sm" variant="outline" icon={<Unlock className="size-3.5" />} onClick={() => setLifting(h)}>
          {t('privacyTools.holds.lift')}
        </Button>
      ),
    },
  ];

  return (
    <Card
      title={t('privacyTools.holds.title')}
      actions={
        <Button size="sm" icon={<Lock className="size-3.5" />} onClick={() => setPlacing(true)}>
          {t('privacyTools.holds.place')}
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted">{t('privacyTools.holds.description')}</p>
      <DataTable
        columns={columns}
        rows={holds.data}
        rowKey={(h) => `${h.entity_type}:${h.entity_id}`}
        loading={holds.isLoading}
        error={holds.error}
        onRetry={() => void holds.refetch()}
        empty={<EmptyState icon={<Gavel className="size-6" />} title={t('privacyTools.holds.empty')} />}
      />
      <PlaceHoldDialog open={placing} onClose={() => setPlacing(false)} />
      <ReasonDialog
        open={!!lifting}
        title={t('privacyTools.holds.liftTitle')}
        description={lifting ? t('privacyTools.holds.liftDescription', { label: lifting.label }) : undefined}
        label={t('privacyTools.holds.liftReason')}
        confirmLabel={t('privacyTools.holds.lift')}
        loading={lift.isPending}
        onClose={() => setLifting(null)}
        onConfirm={(reason) => lifting && lift.mutate({ hold: lifting, reason })}
      />
    </Card>
  );
}

interface Target {
  id: string;
  label: string;
  detail: string;
}

function useTargetSearch(entity: LegalHoldEntity, q: string) {
  const query = useDebouncedValue(q.trim(), 300);
  return useQuery<Target[]>({
    queryKey: ['admin', 'privacy', 'hold-targets', entity, query],
    enabled: query.length >= 2,
    queryFn: async () => {
      if (entity === 'user') {
        const page = await adminApi.listUsers({ q: query, page: 1, page_size: 10 });
        return page.items.map((u) => ({ id: u.id, label: u.full_name || u.email || u.id, detail: [u.email, u.role].filter(Boolean).join(' · ') }));
      }
      const page = await casesApi.list({ q: query, page: 1, page_size: 10 });
      return page.items.map((c) => ({ id: c.id, label: c.case_number, detail: `${c.patient.full_name} · ${c.hospital.name}` }));
    },
    staleTime: 30_000,
  });
}

function PlaceHoldDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useAppTranslation();
  const [entity, setEntity] = useState<LegalHoldEntity>('user');
  const [q, setQ] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const results = useTargetSearch(entity, q);

  const reset = () => {
    setEntity('user');
    setQ('');
    setTarget(null);
    setReason('');
    setTouched(false);
  };
  const close = () => {
    reset();
    onClose();
  };

  const place = useOpsMutation({
    mutationFn: () => privacyToolsApi.setLegalHold(entity, target!.id, { legal_hold: true, reason: reason.trim() }),
    success: (h) => t('privacyTools.holds.placed', { label: h.label }),
    invalidate: [privacyToolsKeys.holds],
    onSuccess: close,
  });

  const reasonInvalid = reason.trim().length < LEGAL_HOLD_MIN_REASON;
  return (
    <Modal
      open={open}
      onClose={close}
      title={t('privacyTools.holds.placeTitle')}
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={place.isPending}>
            {t('ui.cancel')}
          </Button>
          <Button
            loading={place.isPending}
            disabled={!target}
            onClick={() => {
              setTouched(true);
              if (target && !reasonInvalid) place.mutate();
            }}
          >
            {t('privacyTools.holds.place')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Field label={t('privacyTools.holds.targetType')}>
          {(id) => (
            <Select
              id={id}
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value as LegalHoldEntity);
                setTarget(null);
              }}
              options={[
                { value: 'user', label: t('privacyTools.holds.entity.user') },
                { value: 'case', label: t('privacyTools.holds.entity.case') },
              ]}
            />
          )}
        </Field>
        <Field
          label={t(entity === 'user' ? 'privacyTools.holds.searchUser' : 'privacyTools.holds.searchCase')}
          hint={t('privacyTools.holds.searchHint')}
        >
          {(id) => <Input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} data-autofocus />}
        </Field>
        {target ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
            <span>
              <span className="font-medium">{target.label}</span>
              <span className="ms-2 text-muted">{target.detail}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setTarget(null)}>
              {t('privacyTools.holds.change')}
            </Button>
          </div>
        ) : q.trim().length >= 2 ? (
          <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm">
            {results.isLoading ? (
              <li className="px-3 py-2 text-muted">{t('ui.loading')}</li>
            ) : results.data && results.data.length > 0 ? (
              results.data.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-start hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                    onClick={() => setTarget(r)}
                  >
                    <span className="font-medium">{r.label}</span>
                    <span className="ms-2 text-muted">{r.detail}</span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-muted">{t('privacyTools.holds.noMatches')}</li>
            )}
          </ul>
        ) : null}
        <Field
          label={t('privacyTools.holds.reason')}
          hint={t('privacyTools.holds.reasonHint')}
          required
          error={touched && reasonInvalid ? t('privacyTools.holds.reasonTooShort', { min: LEGAL_HOLD_MIN_REASON }) : null}
        >
          {(id) => (
            <Textarea id={id} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} invalid={touched && reasonInvalid} />
          )}
        </Field>
      </div>
    </Modal>
  );
}
