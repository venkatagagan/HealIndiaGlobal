import { useEffect } from 'react';
import { i18n } from '@hig/shared/lib';

/** Sets document.title while mounted: "Cases · Hospital Portal · Heal India Global". */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = i18n.t('hospital:layout.documentTitle', { title });
    return () => {
      document.title = previous;
    };
  }, [title]);
}
