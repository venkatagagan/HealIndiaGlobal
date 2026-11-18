/**
 * WhatsApp updates (GET/POST/DELETE /me/whatsapp): enter a phone number -> 6-digit code on WhatsApp -> active.
 * Only general updates (quotes, bookings, reminders, payments) are sent, never medical details; replying STOP to
 * any message also turns them off.
 */
import { useState } from 'react';
import { Trans } from 'react-i18next';
import { toast } from 'sonner';
import { MessageCircle, ShieldCheck } from 'lucide-react';
import { attemptsLeft, errorMessage, isApiError } from '@hig/shared/api';
import { useAppTranslation } from '../../../../i18n';
import { useWhatsAppConfirm, useWhatsAppOptOut, useWhatsAppStatus, useWhatsAppVerify } from '../../api/discharge';
import { useMe } from '../../lib/session';
import { formatDateTime, formatTime } from '../../lib/shared';
import { Alert, Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, ErrorState, Field, Input, Skeleton, type Tone } from '../../ui/primitives';

const PHONE_RE = /^\+[1-9][0-9 ()-]{6,24}$/;
const STATUS_TONES: Record<string, Tone> = { active: 'green', pending: 'amber', opted_out: 'neutral', none: 'neutral' };

export function WhatsAppCard() {
  const { t } = useAppTranslation();
  const me = useMe();
  const isGuest = me.data?.is_guest ?? false;
  const status = useWhatsAppStatus(!isGuest);
  const verify = useWhatsAppVerify();
  const confirm = useWhatsAppConfirm();
  const optOut = useWhatsAppOptOut();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const data = status.data;
  const available = data?.available ?? false;
  const current = data?.status ?? 'none';
  const showCodeStep = current === 'pending' && !editing;
  const showPhoneStep = available && !isGuest && (current === 'none' || current === 'opted_out' || editing);

  async function sendCode() {
    const value = phone.trim();
    if (!PHONE_RE.test(value)) {
      setError(t('whatsapp.errors.phoneInvalid'));
      return;
    }
    setError(null);
    try {
      await verify.mutateAsync(value);
      setCode('');
      setEditing(false);
      toast.success(t('whatsapp.codeSent'));
    } catch (err) {
      const errCode = isApiError(err) ? err.code : '';
      if (errCode === 'invalid_contact') setError(t('whatsapp.errors.phoneInvalid'));
      else if (errCode === 'whatsapp_unavailable') setError(t('whatsapp.unavailable'));
      else if (errCode === 'rate_limited') setError(t('whatsapp.errors.rateLimited'));
      else if (errCode === 'guest_upgrade_required') setError(t('whatsapp.errors.guest'));
      else setError(errorMessage(err));
    }
  }

  async function confirmCode() {
    if (!/^\d{6}$/.test(code)) {
      setError(t('whatsapp.errors.codeFormat'));
      return;
    }
    setError(null);
    try {
      await confirm.mutateAsync(code);
      setCode('');
      setPhone('');
      toast.success(t('whatsapp.turnedOn'));
    } catch (err) {
      const errCode = isApiError(err) ? err.code : '';
      if (errCode === 'invalid_code') {
        const left = attemptsLeft(err);
        setError(left == null ? t('whatsapp.errors.invalidCode') : t('whatsapp.errors.invalidCodeLeft', { count: left }));
      } else if (errCode === 'code_expired') setError(t('whatsapp.errors.codeExpired'));
      else if (errCode === 'too_many_attempts') setError(t('whatsapp.errors.tooManyAttempts'));
      else if (errCode === 'whatsapp_no_pending_code') setError(t('whatsapp.errors.noPendingCode'));
      else if (errCode === 'rate_limited') setError(t('whatsapp.errors.rateLimited'));
      else setError(errorMessage(err));
    }
  }

  function turnOff() {
    optOut.mutate(undefined, {
      onSuccess: () => {
        setConfirmOff(false);
        setEditing(false);
        toast.success(t('whatsapp.turnedOff'));
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <MessageCircle className="size-5 text-success-ink" aria-hidden />
            {t('whatsapp.title')}
          </span>
        }
        description={t('whatsapp.description')}
        action={data && available ? <Badge tone={STATUS_TONES[current] ?? 'neutral'}>{t(`whatsapp.status.${current}`)}</Badge> : undefined}
      />
      <CardBody className="space-y-4">
        <Alert tone="blue" icon={<ShieldCheck className="size-5" aria-hidden />}>
          <p>{t('whatsapp.privacy')}</p>
          <p className="mt-1">{t('whatsapp.stopHint')}</p>
        </Alert>

        {isGuest ? (
          <p className="text-sm text-muted">{t('whatsapp.errors.guest')}</p>
        ) : status.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : status.isError ? (
          <ErrorState error={status.error} onRetry={() => void status.refetch()} />
        ) : !available ? (
          <Alert tone="amber">{t('whatsapp.unavailable')}</Alert>
        ) : (
          <>
            {current === 'active' && !editing ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-fg">
                    <Trans
                      t={t}
                      i18nKey="whatsapp.activeOn"
                      values={{ phone: data?.phone_masked ?? '' }}
                      components={{ 0: <span dir="ltr" className="font-mono" /> }}
                    />
                  </p>
                  {data?.opted_in_at ? (
                    <p className="text-muted">{t('whatsapp.since', { date: formatDateTime(data.opted_in_at) })}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    {t('whatsapp.changeNumber')}
                  </Button>
                  <Button variant="outline" size="sm" className="text-danger-ink" onClick={() => setConfirmOff(true)}>
                    {t('whatsapp.turnOff')}
                  </Button>
                </div>
              </div>
            ) : null}

            {current === 'opted_out' && data?.opted_out_at && !editing ? (
              <p className="text-sm text-muted">{t('whatsapp.optedOutOn', { date: formatDateTime(data.opted_out_at) })}</p>
            ) : null}

            {showCodeStep ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void confirmCode();
                }}
              >
                <p className="text-sm text-fg">
                  <Trans
                    t={t}
                    i18nKey="whatsapp.codeSentTo"
                    values={{ phone: data?.phone_masked ?? '' }}
                    components={{ 0: <span dir="ltr" className="font-mono" /> }}
                  />
                </p>
                {data?.code_expires_at ? (
                  <p className="text-xs text-muted">{t('whatsapp.codeExpires', { time: formatTime(data.code_expires_at) })}</p>
                ) : null}
                <Field label={t('whatsapp.code')} htmlFor="wa-code" className="max-w-xs">
                  <Input
                    id="wa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    dir="ltr"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </Field>
                <p className="text-xs text-muted">{t('whatsapp.consentNote')}</p>
                {error ? <Alert tone="red">{error}</Alert> : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" loading={confirm.isPending}>
                    {t('whatsapp.confirm')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setError(null);
                      setEditing(true);
                    }}
                  >
                    {t('whatsapp.changeNumber')}
                  </Button>
                </div>
              </form>
            ) : null}

            {showPhoneStep ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendCode();
                }}
              >
                <Field label={t('whatsapp.phone')} htmlFor="wa-phone" hint={t('whatsapp.phoneHint')} className="max-w-sm">
                  <Input
                    id="wa-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    dir="ltr"
                    placeholder="+234 803 123 4567"
                    maxLength={32}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
                {error ? <Alert tone="red">{error}</Alert> : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" loading={verify.isPending}>
                    {current === 'active' || current === 'pending' ? t('whatsapp.sendCode') : t('whatsapp.turnOn')}
                  </Button>
                  {editing ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setError(null);
                        setEditing(false);
                      }}
                    >
                      {t('whatsapp.cancel')}
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </>
        )}
      </CardBody>

      <ConfirmDialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        onConfirm={turnOff}
        title={t('whatsapp.turnOffTitle')}
        confirmLabel={t('whatsapp.turnOff')}
        tone="danger"
        loading={optOut.isPending}
      >
        {t('whatsapp.turnOffBody')}
      </ConfirmDialog>
    </Card>
  );
}
