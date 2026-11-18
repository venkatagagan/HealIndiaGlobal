import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage, hospitalPortalApi, type HospitalProfileOut } from '@hig/shared/api';
import { Button, Checkbox, ErrorState, Skeleton } from '../../components/ui';
import { useAppTranslation } from '../../i18n';
import { qk, useSpecialties } from '../../lib/queries';

/** Step 3 - specialties offered (PUT /hospital-portal/specialties). */
export function SpecialtiesStep({ profile, onSaved }: { profile: HospitalProfileOut; onSaved?: () => void }) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const specialties = useSpecialties();

  const initial = useMemo(() => {
    if (profile.specialty_ids) return profile.specialty_ids;
    // fall back to matching names (HospitalCard.specialties holds names)
    const names = new Set(profile.specialties ?? []);
    return (specialties.data ?? []).filter((s) => names.has(s.name)).map((s) => s.id);
  }, [profile, specialties.data]);
  const [selected, setSelected] = useState<string[] | null>(null);
  const value = selected ?? initial;

  const save = useMutation({
    mutationFn: () => hospitalPortalApi.setSpecialties({ specialty_ids: value }),
    onSuccess: (updated) => {
      if (updated && typeof updated === 'object' && 'status' in updated) queryClient.setQueryData(qk.profile, updated);
      else void queryClient.invalidateQueries({ queryKey: qk.profile });
      toast.success(t('onboarding.specialties.saved'));
      onSaved?.();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (specialties.isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }
  if (specialties.isError) return <ErrorState error={specialties.error} onRetry={() => void specialties.refetch()} />;

  const toggle = (id: string) => setSelected(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 dark:text-slate-400">{t('onboarding.specialties.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {specialties.data.map((s) => (
          <div
            key={s.id}
            className="rounded-lg border border-slate-200 p-3 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50/50 dark:border-slate-700 dark:has-[:checked]:bg-brand-500/10"
          >
            <Checkbox
              label={s.name}
              description={s.procedures_count ? t('onboarding.specialties.proceduresInCatalog', { count: s.procedures_count }) : undefined}
              checked={value.includes(s.id)}
              onChange={() => toggle(s.id)}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-500 dark:text-slate-400">{t('onboarding.specialties.selected', { count: value.length })}</span>
        <Button loading={save.isPending} disabled={value.length === 0} onClick={() => save.mutate()}>
          {onSaved ? t('onboarding.saveAndContinue') : t('onboarding.specialties.save')}
        </Button>
      </div>
    </div>
  );
}
