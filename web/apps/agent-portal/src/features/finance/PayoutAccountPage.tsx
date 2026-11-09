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
import { useDocumentTitle } from '../../lib/shared';

const baseSchema = z.object({
  account_holder_name: z.string().trim().min(2, 'Enter the account holder name').max(120),
  account_number: z.string().trim(),
  confirm_account_number: z.string().trim(),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), 'IFSC looks like HDFC0001234'),
  swift: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v), 'Enter an 8 or 11 character SWIFT/BIC'),
  bank_name: z.string().trim().max(120),
  is_primary: z.boolean(),
});
type FormValues = z.infer<typeof baseSchema>;

function makeSchema(editing: boolean) {
  return baseSchema.superRefine((v, ctx) => {
    const acc = v.account_number.replace(/\s+/g, '');
    if (!editing || acc) {
      if (!/^[A-Za-z0-9]{6,34}$/.test(acc)) {
        ctx.addIssue({ code: 'custom', path: ['account_number'], message: 'Enter 6–34 letters or digits (account number or IBAN)' });
      }
      if (acc !== v.confirm_account_number.replace(/\s+/g, '')) {
        ctx.addIssue({ code: 'custom', path: ['confirm_account_number'], message: 'Account numbers do not match' });
      }
    }
    if (!v.ifsc && !v.swift) {
      ctx.addIssue({ code: 'custom', path: ['ifsc'], message: 'Provide an IFSC (India) or a SWIFT/BIC code' });
    }
  });
}

export function PayoutAccountPage() {
  useDocumentTitle('Payout account');
  const accounts = useQuery({ queryKey: qk.payoutAccounts, queryFn: listOwnPayoutAccounts });
  const [editing, setEditing] = useState<PayoutAccountOut | 'new' | null>(null);

  return (
    <div>
      <PageHeader
        title="Payout account"
        description="Where we send your commission. Account numbers are stored encrypted and only the last digits are shown."
        actions={
          accounts.data && accounts.data.length > 0 ? (
            <Button variant="outline" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setEditing('new')}>
              Add another account
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
            title="No payout account yet"
            description="Add the bank account where your commission should be paid. Our finance team verifies it before the first payout."
            action={<Button onClick={() => setEditing('new')}>Add payout account</Button>}
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
                    <p className="font-semibold">{a.bank_name || 'Bank account'}</p>
                    <p className="font-mono text-sm text-muted">{a.account_number_masked}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" aria-label="Edit account" onClick={() => setEditing(a)} icon={<Pencil className="h-4 w-4" aria-hidden />} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted uppercase">Account holder</dt>
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
                    <BadgeCheck className="h-3 w-3" aria-hidden /> Verified
                  </Badge>
                ) : (
                  <Badge tone="warning">
                    <Clock className="h-3 w-3" aria-hidden /> Verification pending
                  </Badge>
                )}
                {a.is_primary && (
                  <Badge tone="accent">
                    <Star className="h-3 w-3" aria-hidden /> Primary
                  </Badge>
                )}
                {a.status === 'disabled' && <Badge tone="danger">Disabled</Badge>}
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
      toast.success(editing ? 'Payout account updated — it will be re-verified if bank details changed' : 'Payout account added');
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
      title={editing ? 'Edit payout account' : 'Add payout account'}
      description="The account must be in your name or your agency’s registered name."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form="payout-form" loading={save.isPending}>
            Save account
          </Button>
        </>
      }
    >
      <form id="payout-form" noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => save.mutate(v))}>
        <FormField label="Account holder name" htmlFor="pa-holder" error={errors.account_holder_name?.message} required className="sm:col-span-2">
          <Input id="pa-holder" autoComplete="name" {...register('account_holder_name')} />
        </FormField>
        <FormField
          label="Account number / IBAN"
          htmlFor="pa-number"
          error={errors.account_number?.message}
          required={!editing}
          hint={editing ? `Leave blank to keep ${account?.account_number_masked ?? 'the current number'}` : undefined}
        >
          <Input id="pa-number" autoComplete="off" inputMode="text" {...register('account_number')} />
        </FormField>
        <FormField label="Confirm account number" htmlFor="pa-confirm" error={errors.confirm_account_number?.message} required={!editing}>
          <Input id="pa-confirm" autoComplete="off" onPaste={(e) => e.preventDefault()} {...register('confirm_account_number')} />
        </FormField>
        <FormField label="IFSC (India)" htmlFor="pa-ifsc" error={errors.ifsc?.message}>
          <Input id="pa-ifsc" className="uppercase" {...register('ifsc')} />
        </FormField>
        <FormField label="SWIFT / BIC (international)" htmlFor="pa-swift" error={errors.swift?.message}>
          <Input id="pa-swift" className="uppercase" {...register('swift')} />
        </FormField>
        <FormField label="Bank name" htmlFor="pa-bank" error={errors.bank_name?.message} className="sm:col-span-2">
          <Input id="pa-bank" {...register('bank_name')} />
        </FormField>
        <Checkbox className="sm:col-span-2" label="Use as primary payout account" {...register('is_primary')} />
      </form>
    </Modal>
  );
}
