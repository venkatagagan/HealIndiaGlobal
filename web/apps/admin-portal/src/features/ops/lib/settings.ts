import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@hig/shared/api';
import { opsKeys } from './mutations';

/** All platform settings (GET /admin/settings), shared cache for the settings page and hint texts. */
export function useSettings() {
  return useQuery({ queryKey: opsKeys.settings, queryFn: () => adminApi.listSettings(), staleTime: 60_000 });
}

/** Value of one platform setting, or undefined while loading / when absent. */
export function useSettingValue<T>(key: string): T | undefined {
  const { data } = useSettings();
  const found = data?.find((s) => s.key === key);
  return found ? (found.value as T) : undefined;
}
