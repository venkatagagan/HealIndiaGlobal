/**
 * Break-glass (emergency) read of a document outside the support user's cases. The reason is sent as
 * `X-Break-Glass-Reason` (10-500 characters); the API records a `phi.break_glass` audit row that the patient's
 * access log shows, and notifies the admins.
 */
import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAppTranslation } from '../../../i18n';
import { BREAK_GLASS_MAX_REASON, BREAK_GLASS_MIN_REASON } from '../lib/privacyToolsApi';
import { Button, Field, Modal, Textarea } from '../ui';

export function BreakGlassDialog({
  open,
  fileName,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  fileName?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useAppTranslation();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);
  const invalid = reason.trim().length < BREAK_GLASS_MIN_REASON;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('breakGlass.title')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t('ui.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={loading}
            onClick={() => {
              setTouched(true);
              if (!invalid) onConfirm(reason.trim());
            }}
          >
            {t('breakGlass.confirm')}
          </Button>
        </>
      }
    >
      <div className="mb-3 flex gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-ink">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>{t('breakGlass.warning')}</p>
      </div>
      {fileName && <p className="mb-3 truncate text-sm font-medium text-fg">{fileName}</p>}
      <Field
        label={t('breakGlass.reason')}
        hint={t('breakGlass.reasonHint', { min: BREAK_GLASS_MIN_REASON })}
        required
        error={touched && invalid ? t('breakGlass.reasonTooShort', { min: BREAK_GLASS_MIN_REASON }) : null}
      >
        {(id) => (
          <Textarea
            id={id}
            rows={3}
            value={reason}
            maxLength={BREAK_GLASS_MAX_REASON}
            onChange={(e) => setReason(e.target.value)}
            invalid={touched && invalid}
            data-autofocus
          />
        )}
      </Field>
    </Modal>
  );
}
