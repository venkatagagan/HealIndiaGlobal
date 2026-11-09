import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { configureApiClient, type HospitalMemberRole, type UserHospitalRef } from '@hig/shared/api';
import { prefs } from '../lib/prefs';
import { useAuth } from './AuthProvider';

/**
 * Active hospital selection. The id is sent on every API request as `X-Hospital-Id` through the shared
 * client's `extraHeaders` hook (PLAN 8.5: the server defaults to the first hospital when the header is absent).
 */
const headerState: { hospitalId: string | null } = { hospitalId: prefs.get('hospital_id') };
let configured = false;

export function installHospitalHeader(): void {
  if (configured) return;
  configured = true;
  configureApiClient({ extraHeaders: () => ({ 'X-Hospital-Id': headerState.hospitalId }) });
}

function setHeaderHospital(id: string | null): void {
  headerState.hospitalId = id;
}

interface HospitalContextValue {
  hospitals: UserHospitalRef[];
  current: UserHospitalRef | null;
  memberRole: HospitalMemberRole | null;
  switchHospital: (id: string) => void;
  /** owner/admin may manage team, pricing and profile */
  canManage: boolean;
  /** owner/admin/finance may see finance */
  canFinance: boolean;
}

const HospitalContext = createContext<HospitalContextValue | null>(null);

function resolveId(hospitals: UserHospitalRef[], wanted: string | null): string | null {
  if (wanted && hospitals.some((h) => h.id === wanted)) return wanted;
  const stored = prefs.get('hospital_id');
  if (stored && hospitals.some((h) => h.id === stored)) return stored;
  return hospitals[0]?.id ?? null;
}

export function HospitalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const hospitals = useMemo(() => user?.hospitals ?? [], [user]);
  const membershipKnown = Array.isArray(user?.hospitals);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // derived, always valid for the current membership list (login / logout / reload)
  const activeId = resolveId(hospitals, selectedId);

  // Layout effects run before the passive effects in which queries start fetching, so every request
  // carries the right header.
  useLayoutEffect(() => {
    setHeaderHospital(activeId);
  }, [activeId]);

  const switchHospital = useCallback(
    (id: string) => {
      if (id === headerState.hospitalId) return;
      setHeaderHospital(id);
      prefs.set('hospital_id', id);
      setSelectedId(id);
      // every cached query belongs to the previous hospital
      void queryClient.resetQueries();
    },
    [queryClient],
  );

  const value = useMemo<HospitalContextValue>(() => {
    const current = hospitals.find((h) => h.id === activeId) ?? null;
    const role = current?.member_role ?? null;
    // When the API omits membership details, show management UI and let the server enforce permissions.
    const unknownRole = !membershipKnown;
    return {
      hospitals,
      current,
      memberRole: role,
      switchHospital,
      canManage: unknownRole || role === 'owner' || role === 'admin',
      canFinance: unknownRole || role === 'owner' || role === 'admin' || role === 'finance',
    };
  }, [hospitals, activeId, switchHospital, membershipKnown]);

  return <HospitalContext.Provider value={value}>{children}</HospitalContext.Provider>;
}

export function useHospital(): HospitalContextValue {
  const ctx = useContext(HospitalContext);
  if (!ctx) throw new Error('useHospital must be used inside <HospitalProvider>');
  return ctx;
}
