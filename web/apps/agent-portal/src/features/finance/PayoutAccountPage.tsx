import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, Clock, Landmark, Pencil, Plus, Star } from 'lucide-react';
import { errorMessage, fieldErrors, financeApi, type PayoutAccountOut } from '@hig/shared/api';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
} from '../../components/ui';
import { listOwnPayoutAccounts } from '../../lib/financeAdapters';
import { qk } from '../../lib/queries';
import { i18n, useDocumentTitle } from '../../lib/shared';
import { useAppTranslation } from '../../i18n';

/** Validation message resolved when shown (follows the UI language). */
const msg = (key: string) => ({ error: () => i18n.t(`agent:payoutAccount.errors.${key}`) });
const text = (key: string) => i18n.t(`agent:payoutAccount.errors.${key}`);

const baseSchema = z.object({
  account_holder_name: z.string().trim().min(2, msg('holder')).max(120),
  account_number: z.string().trim(),
  confirm_account_number: z.string().trim(),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), msg('ifsc')),
  swift: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v), msg('swift')),
  bank_name: z.string().trim().max(120),
  is_primary: z.boolean(),
});
type FormValues = z.infer<typeof baseSchema>;

function makeSchema(editing: boolean) {
  return baseSchema.superRefine((v, ctx) => {
    const acc = v.account_number.replace(/\s+/g, '');
    if (!editing || acc) {
      if (!/^[A-Za-z0-9]{6,34}$/.test(acc)) {
        ctx.addIssue({ code: 'custom', path: ['account_number'], message: text('accountNumber') });
      }
      if (acc !== v.confirm_account_number.replace(/\s+/g, '')) {
        ctx.addIssue({ code: 'custom', path: ['confirm_account_number'], message: text('mismatch') });
      }
    }
    if (!v.ifsc && !v.swift) {
      ctx.addIssue({ code: 'custom', path: ['ifsc'], message: text('ifscOrSwift') });
    }
  });
}

export function PayoutAccountPage() {
  const { t } = useAppTranslation();
  useDocumentTitle(t('payoutAccount.title'));
  const accounts = useQuery({ queryKey: qk.payoutAccounts, queryFn: listOwnPayoutAccounts });
  const [editing, setEditing] = useState<PayoutAccountOut | 'new' | null>(null);

  return (
    <div>
      <PageHeader
        title={t('payoutAccount.title')}
        description={t('payoutAccount.description')}
        actions={
          accounts.data && accounts.data.length > 0 ? (
            <Button variant="outline" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setEditing('new')}>
              {t('payoutAccount.addAnother')}
            </Button>
          ) : undefined
        }
      />
      {accounts.isPending ? (
        <LoadingBlock />
      ) : accounts.isError ? (
        <Card>
          <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />
        </Card>
      ) : accounts.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Landmark className="h-6 w-6" />}
            title={t('payoutAccount.emptyTitle')}
            description={t('payoutAccount.emptyDescription')}
            action={<Button onClick={() => setEditing('new')}>{t('payoutAccount.add')}</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.data.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-primary-soft p-2.5 text-primary-ink">
                    <Landmark className="h-5 w-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-semibold">{a.bank_name || t('payoutAccount.bankAccount')}</p>
                    <p className="font-mono text-sm text-muted">{a.account_number_masked}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" aria-label={t('payoutAccount.editAccount')} onClick={() => setEditing(a)} icon={<Pencil className="h-4 w-4" aria-hidden />} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted uppercase">{t('payoutAccount.accountHolder')}</dt>
                  <dd>{a.account_holder_name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted uppercase">{a.ifsc ? 'IFSC' : 'SWIFT'}</dt>
                  <dd className="font-mono">{a.ifsc ?? a.swift ?? '—'}</dd>
                </div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {a.is_verified ? (
                  <Badge tone="success">
                    <BadgeCheck className="h-3 w-3" aria-hidden /> {t('payoutAccount.verified')}
                  </Badge>
                ) : (
                  <Badge tone="warning">
                    <Clock className="h-3 w-3" aria-hidden /> {t('payoutAccount.pending')}
                  </Badge>
                )}
                {a.is_primary && (
                  <Badge tone="accent">
                    <Star className="h-3 w-3" aria-hidden /> {t('payoutAccount.primary')}
                  </Badge>
                )}
                {a.status === 'disabled' && <Badge tone="danger">{t('payoutAccount.disabled')}</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}
      <AccountDialog
        open={editing !== null}
        account={editing === 'new' ? null : editing}
        isFirst={(accounts.data?.length ?? 0) === 0}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function AccountDialog({
  open,
  account,
  isFirst,
  onClose,
}: {
  open: boolean;
  account: PayoutAccountOut | null;
  isFirst: boolean;
  onClose: () => void;
}) {
  const { t } = useAppTranslation();
  const queryClient = useQueryClient();
  const editing = Boolean(account);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(makeSchema(editing)),
    values: {
      account_holder_name: account?.account_holder_name ?? '',
      account_number: '',
      confirm_account_number: '',
      ifsc: account?.ifsc ?? '',
      swift: account?.swift ?? '',
      bank_name: account?.bank_name ?? '',
      is_primary: account?.is_primary ?? isFirst,
    },
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const accountNumber = v.account_number.replace(/\s+/g, '');
      const common = {
        account_holder_name: v.account_holder_name,
        ifsc: v.ifsc || null,
        swift: v.swift || null,
        bank_name: v.bank_name || null,
        is_primary: v.is_primary,
      };
      if (account) {
        return financeApi.updatePayoutAccount(account.id, { ...common, ...(accountNumber ? { account_number: accountNumber } : {}) });
      }
      return financeApi.createPayoutAccount({ ...common, account_number: accountNumber });
    },
    onSuccess: () => {
      toast.success(editing ? t('payoutAccount.updated') : t('payoutAccount.added'));
      void queryClient.invalidateQueries({ queryKey: qk.payoutAccounts });
      reset();
      onClose();
    },
    onError: (error) => {
      const fields = fieldErrors(error);
      let mapped = false;
      for (const [key, message] of Object.entries(fields)) {
        if (key in baseSchema.shape) {
          setError(key as keyof FormValues, { message });
          mapped = true;
        }
      }
      if (!mapped) toast.error(errorMessage(error));
    },
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('payoutAccount.editTitle') : t('payoutAccount.add')}
      description={t('payoutAccount.dialogDescription')}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            {t('payoutAccount.cancel')}
          </Button>
          <Button type="submit" form="payout-form" loading={save.isPending}>
            {t('payoutAccount.save')}
          </Button>
        </>
      }
    >
      <form id="payout-form" noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))}>
        <FormField label={t('payoutAccount.holderName')} htmlFor="pa-holder" error={errors.account_holder_name?.message} required className="sm:col-span-2">
          <Input id="pa-holder" autoComplete="name" {...register('account_holder_name')} />
        </FormField>
        <FormField
          label={t('payoutAccount.accountNumber')}
          htmlFor="pa-number"
          error={errors.account_number?.message}
          required={!editing}
          hint={editing ? (account?.account_number_masked ? t('payoutAccount.keepMasked', { masked: account.account_number_masked }) : t('payoutAccount.keepCurrent')) : undefined}
        >
          <Input id="pa-number" autoComplete="off" inputMode="text" {...register('account_number')} />
        </FormField>
        <FormField label={t('payoutAccount.confirmNumber')} htmlFor="pa-confirm" error={errors.confirm_account_number?.message} required={!editing}>
          <Input id="pa-confirm" autoComplete="off" onPaste={(e) => e.preventDefault()} {...register('confirm_account_number')} />
        </FormField>
        <FormField label={t('payoutAccount.ifsc')} htmlFor="pa-ifsc" error={errors.ifsc?.message}>
          <Input id="pa-ifsc" className="uppercase" {...register('ifsc')} />
        </FormField>
        <FormField label={t('payoutAccount.swift')} htmlFor="pa-swift" error={errors.swift?.message}>
          <Input id="pa-swift" className="uppercase" {...register('swift')} />
        </FormField>
        <FormField label={t('payoutAccount.bankName')} htmlFor="pa-bank" error={errors.bank_name?.message} className="sm:col-span-2">
          <Input id="pa-bank" {...register('bank_name')} />
        </FormField>
        <Checkbox className="sm:col-span-2" label={t('payoutAccount.usePrimary')} {...register('is_primary')} />
      </form>
    </Modal>
  );
}
