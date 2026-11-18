import { ExternalLink } from 'lucide-react';
import type { BenchmarkSource } from '@/lib/cost';

export interface EstimateSourceLabels {
  estimate: string;
  estimateSource: string;
  estimateSourceYear: string;
  sourceLinkLabel: string;
}

const fill = (template: string, vars: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/**
 * "Estimate · OECD Health Statistics (2025)" with a link to the source: shown next to every home-country price
 * (legal display rule, lib/cost.ts). Hook-free, so server and client components both use it.
 */
export function EstimateSource({
  benchmark,
  labels,
  className = '',
}: {
  benchmark: BenchmarkSource | null;
  labels: EstimateSourceLabels;
  className?: string;
}) {
  if (!benchmark) return <span className={`text-xs text-slate-600 ${className}`}>{labels.estimate}</span>;
  const text = benchmark.source
    ? benchmark.year
      ? fill(labels.estimateSourceYear, { source: benchmark.source, year: benchmark.year })
      : fill(labels.estimateSource, { source: benchmark.source })
    : labels.estimate;
  if (!benchmark.sourceUrl) return <span className={`text-xs text-slate-600 ${className}`}>{text}</span>;
  return (
    <a
      href={benchmark.sourceUrl}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={labels.sourceLinkLabel}
      className={`inline-flex items-center gap-1 text-xs text-slate-600 underline underline-offset-2 hover:text-primary-800 ${className}`}
    >
      {text}
      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">({labels.sourceLinkLabel})</span>
    </a>
  );
}
