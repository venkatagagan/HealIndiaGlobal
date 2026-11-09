import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, Landmark, Pencil } from 'lucide-react';
import { errorMessage, fieldErrors, financeApi, type PayoutAccountOut } from '@hig/shared/api';
import { Badge, Button, ErrorState, FormField, Input, Skeleton } from '../../components/ui';
import { qk } from '../../lib/queries';

const schema = z
  .object({
    account_holder_name: z.string().trim().min(2, 'Enter the account holder name').max(200),
    account_number: z.string().trim().regex(/^[0-9]{6,20}$/, 'Account number must be 6–20 digits'),
    confirm_account_number: z.string().trim(),
    ifsc: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/, 'IFSC looks like HDFC0001234'),
    bank_name: z.string().trim().min(2, 'Enter the bank name').max(120),
    swift: z
      .string()
      .trim()
      .regex(/^([A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?)?$/, 'SWIFT/BIC is 8 or 11 characters'),
  })
  .refine((v) => v.account_number === v.confirm_account_number, {
    path: ['confirm_account_number'],
    message: 'Account numbers do not match',
  });

type FormValues = z.infer<typeof schema>;

function AccountSummary({ account }: { account: PayoutAccountOut }) {
  return (
    <div className="flex flex-wrap items-start gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="rounded-lg bg-brand-50 p-2.5 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
        <Landmark className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900 dark:text-white">{account.account_holder_name}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {account.bank_name ?? 'Bank'} · {account.account_number_masked}
          {account.ifsc ? ` · IFSC ${account.ifsc}` : ''}
          {account.swift ? ` · SWIFT ${account.swift}` : ''}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {account.is_verified ? (
            <Badge tone="green">
              <BadgeCheck className="mr-1 h-3.5 w-3.5" aria-hidden />
              Verified
            </Badge>
          ) : (
            <Badge tone="amber">Pending verification</Badge>
          )}
          {account.is_primary && <Badge tone="blue">Primary</Badge>}
          {account.status === 'disabled' && <Badge tone="red">Disabled</Badge>}
        </div>
      </div>
    </div>
  );
}

/**
 * Hospital payout (settlement) bank account. The account number is write-only and comes back masked;
 * editing requires re-entering it. Changing details resets verification server-side.
 */
export function PayoutAccountSection({ onSaved }: { onSaved?: () => void }) {
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: qk.payoutAccounts, queryFn: async () => (await financeApi.listPayoutAccountsPage({ page_size: 100 })).items });
  const [editing, setEditing] = useState(false);

  if (accounts.isPending) return <Skeleton className="h-24 w-full" />;
  if (accounts.isError) return <ErrorState error={accounts.error} onRetry={() => void accounts.refetch()} />;

  const list = accounts.data ?? [];
  const primary = list.find((a) => a.is_primary && a.status === 'active') ?? list[0] ?? null;

  if (primary && !editing) {
    return (
      <div className="space-y-3">
        <AccountSummary account={primary} />
        <Button variant="outline" size="sm" icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setEditing(true)}>
          Change bank account
        </Button>
      </div>
    );
  }

  return (
    <PayoutAccountForm
      existing={primary}
      onCancel={primary ? () => setEditing(false) : undefined}
      onSaved={() => {
        setEditing(false);
        void queryClient.invalidateQueries({ queryKey: qk.payoutAccounts });
        onSaved?.();
      }}
    />
  );
}

function PayoutAccountForm({
  existing,
  onSaved,
  onCancel,
}: {
  existing: PayoutAccountOut | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const ids = useId();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      account_holder_name: existing?.account_holder_name ?? '',
      account_number: '',
      confirm_account_number: '',
      ifsc: existing?.ifsc ?? '',
      bank_name: existing?.bank_name ?? '',
      swift: existing?.swift ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body = {
        account_holder_name: v.account_holder_name,
        account_number: v.account_number,
        ifsc: v.ifsc.toUpperCase(),
        bank_name: v.bank_name,
        swift: v.swift ? v.swift.toUpperCase() : null,
      };
      return existing
        ? financeApi.updatePayoutAccount(existing.id, body)
        : financeApi.createPayoutAccount({ ...body, is_primary: true });
    },
    onSuccess: () => {
      toast.success('Payout account saved. It will be verified by our finance team.');
      onSaved();
    },
    onError: (error) => {
      const fields = fieldErrors(error);
      for (const [key, message] of Object.entries(fields)) {
        if (key in schema.shape) setError(key as keyof FormValues, { message });
      }
      toast.error(errorMessage(error));
    },
  });

  return (
    <form className="space-y-4" noValidate onSubmit={handleSubmit((v) => save.mutate(v))}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Account holder name" htmlFor={`${ids}-holder`} required error={errors.account_holder_name?.message}>
          <Input id={`${ids}-holder`} autoComplete="off" {...register('account_holder_name')} aria-invalid={!!errors.account_holder_name} />
        </FormField>
        <FormField label="Bank name" htmlFor={`${ids}-bank`} required error={errors.bank_name?.message}>
          <Input id={`${ids}-bank`} {...register('bank_name')} aria-invalid={!!errors.bank_name} />
        </FormField>
        <FormField
          label="Account number"
          htmlFor={`${ids}-acc`}
          required
          error={errors.account_number?.message}
          hint={existing ? `Current: ${existing.account_number_masked}. Re-enter to change.` : undefined}
        >
          <Input
            id={`${ids}-acc`}
            inputMode="numeric"
            autoComplete="off"
            {...register('account_number')}
            aria-invalid={!!errors.account_number}
          />
        </FormField>
        <FormField label="Confirm account number" htmlFor={`${ids}-acc2`} required error={errors.confirm_account_number?.message}>
          <Input
            id={`${ids}-acc2`}
            inputMode="numeric"
            autoComplete="off"
            onPaste={(e) => e.preventDefault()}
            {...register('confirm_account_number')}
            aria-invalid={!!errors.confirm_account_number}
          />
        </FormField>
        <FormField label="IFSC" htmlFor={`${ids}-ifsc`} required error={errors.ifsc?.message}>
          <Input id={`${ids}-ifsc`} className="uppercase" {...register('ifsc')} aria-invalid={!!errors.ifsc} />
        </FormField>
        <FormField label="SWIFT / BIC (optional)" htmlFor={`${ids}-swift`} error={errors.swift?.message}>
          <Input id={`${ids}-swift`} className="uppercase" {...register('swift')} aria-invalid={!!errors.swift} />
        </FormField>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Bank details are encrypted at rest and only the last 4 digits are ever shown again.
      </p>
      <div className="flex gap-2">
        <Button type="submit" loading={save.isPending}>
          Save payout account
        </Button>
        {onCancel && (
          <Button variant="outline" onClick={onCancel} disabled={save.isPending}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
