/**
 * Guest AI quota: a 429 with `details.scope = "guest_ai_daily"` (screening, report reading, voice) opens
 * "3 free scans used" with "Create a free account" and the free 15-minute call. Mounted once in PortalShell; it
 * listens to every React Query query/mutation error.
 */
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles, UserPlus, Video } from 'lucide-react';
import { guestAiLimit, isGuestAiLimitError } from '@hig/shared/api';
import { useAppTranslation } from '../../../i18n';
import { paths } from '../lib/paths';
import { Button, ButtonLink, Modal } from '../ui/primitives';
import { GuestUpgradeDialog } from './GuestUpgrade';

export function GuestAiLimitDialog({ limit, onClose }: { limit: number | null; onClose: () => void }) {
  const { t } = useAppTranslation();
  const [upgrade, setUpgrade] = useState(false);
  return (
    <>
      <Modal
        open={limit !== null && !upgrade}
        onClose={onClose}
        title={
          <span className="inline-flex items-center gap-2">
            <Sparkles className="size-5 text-accent" aria-hidden />
            {t('guestAi.title', { count: limit ?? 3 })}
          </span>
        }
        footer={
          <>
            <ButtonLink to={paths.freeCall()} variant="outline" onClick={onClose} icon={<Video className="size-4" aria-hidden />}>
              {t('guestAi.freeCall')}
            </ButtonLink>
            <Button icon={<UserPlus className="size-4" aria-hidden />} onClick={() => setUpgrade(true)}>
              {t('careGates.guest.createAccount')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg">{t('guestAi.body')}</p>
        <p className="mt-2 text-xs text-muted">{t('guestAi.resets')}</p>
      </Modal>
      <GuestUpgradeDialog
        open={upgrade}
        onClose={() => {
          setUpgrade(false);
          onClose();
        }}
      />
    </>
  );
}

export function GuestAiLimitGate() {
  const qc = useQueryClient();
  const [limit, setLimit] = useState<number | null>(null);
  useEffect(() => {
    const onError = (error: unknown) => {
      if (isGuestAiLimitError(error)) setLimit(guestAiLimit(error));
    };
    const unsubQueries = qc.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    const unsubMutations = qc.getMutationCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'error') onError(event.action.error);
    });
    return () => {
      unsubQueries();
      unsubMutations();
    };
  }, [qc]);
  return <GuestAiLimitDialog limit={limit} onClose={() => setLimit(null)} />;
}
