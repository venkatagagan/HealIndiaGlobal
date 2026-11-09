import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Check, Hourglass, LoaderCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@hig/shared/api';
import { qk, useRerunScreening, useScreening } from '../../api/queries';
import { useRealtimeEvent } from '../../lib/realtime';
import { paths } from '../../lib/paths';
import { cn, useDocumentTitle } from '../../lib/shared';
import { Button, ButtonLink, ErrorState } from '../../ui/primitives';

const STEPS = ['Analyzing your condition', 'Matching with specialists', 'Calculating savings'];

export function ProcessingPage() {
  const { id = '' } = useParams();
  useDocumentTitle('Finding your match');
  const navigate = useNavigate();
  const qc = useQueryClient();
  const screening = useScreening(id, { pollMs: 2000 });
  const rerun = useRerunScreening(id);
  const [tick, setTick] = useState(0);

  // Advance the visual steps while the server works (the last one waits for completion).
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1800);
    return () => clearInterval(timer);
  }, []);

  useRealtimeEvent('screening.completed', (event) => {
    if (event.type === 'screening.completed' && event.data.screening_id === id) {
      void qc.invalidateQueries({ queryKey: qk.screening(id) });
    }
  });

  const status = screening.data?.status;
  useEffect(() => {
    if (status !== 'completed') return;
    const t = setTimeout(() => navigate(paths.screeningResults(id), { replace: true }), 900);
    return () => clearTimeout(t);
  }, [status, id, navigate]);

  if (screening.isError) return <ErrorState error={screening.error} onRetry={() => void screening.refetch()} />;
  if (status === 'draft') return <Navigate to={paths.screeningStep(id, 1)} replace />;

  const done = status === 'completed';
  const failed = status === 'failed';
  const active = done ? STEPS.length : Math.min(STEPS.length - 1, tick);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center">
      <div className="relative w-full overflow-hidden rounded-3xl bg-gradient-to-b from-[#2A1458] via-[#1B1240] to-[#0B0F14] px-6 py-12 text-white shadow-xl sm:px-10">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-600/30 blur-3xl" aria-hidden />
        <div className="relative">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center">
            <span className={cn('absolute h-20 w-20 rounded-full bg-violet-500/30', !failed && !done && 'animate-ping')} aria-hidden />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-violet-600">
              {done ? <Check className="h-8 w-8" aria-hidden /> : <LoaderCircle className={cn('h-8 w-8', !failed && 'animate-spin')} aria-hidden />}
            </span>
          </div>
          <h1 className="text-center text-2xl font-bold sm:text-3xl">
            {failed ? 'We hit a problem' : done ? 'Your matches are ready' : 'Finding your perfect match...'}
          </h1>

          {failed ? (
            <div className="mt-6 space-y-4 text-center">
              <p className="text-sm text-slate-300">
                {screening.data?.error ? 'The analysis could not be completed. ' : ''}Your answers are saved - you can try again.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="accent"
                  loading={rerun.isPending}
                  onClick={() =>
                    rerun.mutate(undefined, {
                      onSuccess: () => setTick(0),
                      onError: (err) => toast.error(errorMessage(err)),
                    })
                  }
                >
                  Try again
                </Button>
                <ButtonLink to={paths.dashboard} variant="outline" className="border-white/30 text-white hover:bg-white/10">
                  Back to dashboard
                </ButtonLink>
              </div>
            </div>
          ) : (
            <ol className="mx-auto mt-8 max-w-sm space-y-4" aria-live="polite">
              {STEPS.map((label, i) => {
                const state = i < active || done ? 'done' : i === active ? 'active' : 'todo';
                return (
                  <li key={label} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2',
                        state === 'done' && 'border-violet-500 bg-violet-500',
                        state === 'active' && 'border-violet-400',
                        state === 'todo' && 'border-slate-600',
                      )}
                    >
                      {state === 'done' ? (
                        <Check className="h-4 w-4" aria-hidden />
                      ) : state === 'active' ? (
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-violet-400" aria-hidden />
                      ) : (
                        <Hourglass className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                      )}
                    </span>
                    <span className={cn('text-sm sm:text-base', state === 'todo' ? 'text-slate-500' : 'text-white')}>
                      {label}
                      <span className="sr-only">{state === 'done' ? ' - done' : state === 'active' ? ' - in progress' : ''}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          {!failed ? (
            <p className="mt-10 text-center text-xs text-slate-400">
              This usually takes under a minute. You can leave this page - we will notify you when your matches are ready.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
