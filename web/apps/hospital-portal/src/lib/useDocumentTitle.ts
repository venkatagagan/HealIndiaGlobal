import { useEffect } from 'react';

/** Sets document.title while mounted: "Cases · Hospital Portal · Heal India Global". */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · Hospital Portal · Heal India Global`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
