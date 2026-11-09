import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Search } from 'lucide-react';
import { agentPortalApi, type AgentPatientOut } from '@hig/shared/api';
import { Input, Spinner } from '../../components/ui';
import { countryName } from '../../lib/constants';
import { patientName } from '../../lib/format';
import { qk } from '../../lib/queries';
import { cn, useDebouncedValue } from '../../lib/shared';

/** Searchable single-select list of the agent's patients. */
export function PatientPicker({
  value,
  onChange,
  label = 'Patient',
}: {
  value: AgentPatientOut | null;
  onChange: (patient: AgentPatientOut) => void;
  label?: string;
}) {
  const id = useId();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 250);
  const query = useQuery({
    queryKey: qk.patients({ q, page: 1, picker: true }),
    queryFn: () => agentPortalApi.listPatients({ q: q || undefined, page: 1, page_size: 8 }),
  });

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input id={id} type="search" className="pl-9" placeholder="Search your patients" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div role="listbox" aria-label="Patients" className="max-h-56 overflow-y-auto rounded-lg border border-border">
        {query.isPending ? (
          <div className="flex justify-center p-4">
            <Spinner />
          </div>
        ) : query.isError ? (
          <p className="p-3 text-sm text-danger">Could not load patients.</p>
        ) : query.data.items.length === 0 ? (
          <p className="p-3 text-sm text-muted">No patients found. Add the patient first from the Patients page.</p>
        ) : (
          query.data.items.map((p) => {
            const selected = value?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onChange(p)}
                className={cn(
                  'flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0',
                  selected ? 'bg-primary-soft' : 'hover:bg-surface-2',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{patientName(p)}</span>
                  <span className="block text-xs text-muted">
                    {countryName(p.nationality)}
                    {p.email ? ` · ${p.email}` : ''}
                  </span>
                </span>
                {selected && <Check className="h-4 w-4 text-primary-ink" aria-hidden />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
