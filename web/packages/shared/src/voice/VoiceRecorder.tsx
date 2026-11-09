import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, RotateCcw, Square } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from '../ui/Button';
import { useVoiceText, type VoiceTextKey } from './i18n';

export const VOICE_MAX_SECONDS = 180;
const MIN_SECONDS = 1.5;

export interface RecordedAudio {
  blob: Blob;
  mimeType: string;
  fileName: string;
  durationSeconds: number;
}

export interface VoiceRecorderProps {
  /** hard cap (default 180 s - PLAN 7.2 VOICE_MAX_SECONDS) */
  maxSeconds?: number;
  disabled?: boolean;
  /** called when a recording finished (stop, or cap reached) */
  onRecorded: (audio: RecordedAudio) => void;
  /** called when the user throws the recording away to record again */
  onReset?: () => void;
  className?: string;
}

/** Best container the browser can record: webm/opus (Chrome, Firefox, Edge), mp4/aac (Safari), ogg/opus. */
export function pickAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/ogg;codecs=opus'];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function extensionFor(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4') || mime.includes('aac')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

type RecState = 'idle' | 'requesting' | 'recording' | 'done';

export function VoiceRecorder({ maxSeconds = VOICE_MAX_SECONDS, disabled, onRecorded, onReset, className }: VoiceRecorderProps) {
  const { t } = useVoiceText();
  const [state, setState] = useState<RecState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<VoiceTextKey | null>(null);
  const [notice, setNotice] = useState<VoiceTextKey | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const chunksRef = useRef<Blob[]>([]);
  const onRecordedRef = useRef(onRecorded);
  useEffect(() => {
    onRecordedRef.current = onRecorded;
  });

  const cleanupMedia = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current != null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== 'closed') void ctxRef.current.close().catch(() => undefined);
    ctxRef.current = null;
    setLevel(0);
  }, []);

  useEffect(
    () => () => {
      const rec = recorderRef.current;
      if (rec && rec.state !== 'inactive') {
        rec.onstop = null;
        rec.stop();
      }
      cleanupMedia();
    },
    [cleanupMedia],
  );

  useEffect(
    () => () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    },
    [audioUrl],
  );

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
  }, []);

  async function start() {
    setError(null);
    setNotice(null);
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('micInsecure');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('micUnsupported');
      return;
    }
    setState('requesting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      setError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'micDenied'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'micNotFound'
            : 'micError',
      );
      setState('idle');
      return;
    }
    streamRef.current = stream;

    // level meter
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) {
            const x = (v - 128) / 128;
            sum += x * x;
          }
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 3));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
      }
    } catch {
      /* the meter is optional */
    }

    const mimeType = pickAudioMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 }) : new MediaRecorder(stream);
    } catch {
      cleanupMedia();
      setError('micUnsupported');
      setState('idle');
      return;
    }
    recorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const durationSeconds = Math.min(maxSeconds, (performance.now() - startedAtRef.current) / 1000);
      cleanupMedia();
      const type = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      chunksRef.current = [];
      if (durationSeconds < MIN_SECONDS || blob.size === 0) {
        setNotice('tooShort');
        setState('idle');
        setElapsed(0);
        return;
      }
      setAudioUrl(URL.createObjectURL(blob));
      setState('done');
      onRecordedRef.current({ blob, mimeType: type, fileName: `voice-intake.${extensionFor(type)}`, durationSeconds });
    };
    startedAtRef.current = performance.now();
    setElapsed(0);
    recorder.start(1000);
    setState('recording');
    timerRef.current = window.setInterval(() => {
      const secs = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(secs);
      if (secs >= maxSeconds) {
        setNotice('maxReached');
        stop();
      }
    }, 250);
  }

  function reset() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setElapsed(0);
    setNotice(null);
    setState('idle');
    onReset?.();
  }

  const remaining = Math.max(0, maxSeconds - elapsed);
  const bars = 12;

  return (
    <div className={cn('space-y-3', className)}>
      {state !== 'done' && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface-2/40 p-4">
          {state === 'recording' ? (
            <>
              <div className="flex h-10 items-end gap-1" aria-hidden>
                {Array.from({ length: bars }, (_, i) => {
                  const threshold = (i + 1) / bars;
                  const active = level >= threshold * 0.9;
                  return (
                    <span
                      key={i}
                      className={cn('w-1.5 rounded-full transition-all', active ? 'bg-primary' : 'bg-border')}
                      style={{ height: `${20 + (i % 4) * 8 + (active ? 12 : 0)}%` }}
                    />
                  );
                })}
              </div>
              <p className="flex items-center gap-2 text-sm font-medium text-fg" aria-live="polite">
                <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
                {t('recording')} <span className="tabular-nums">{formatClock(elapsed)}</span>
                <span className="text-muted">· {t('timeLeft', { s: Math.ceil(remaining) })}</span>
              </p>
              <Button variant="danger" size="lg" leftIcon={<Square className="size-4" aria-hidden />} onClick={stop}>
                {t('stop')}
              </Button>
            </>
          ) : (
            <Button
              size="lg"
              leftIcon={<Mic className="size-5" aria-hidden />}
              onClick={() => void start()}
              loading={state === 'requesting'}
              disabled={disabled}
            >
              {t('start')}
            </Button>
          )}
        </div>
      )}

      {state === 'done' && audioUrl && (
        <div className="space-y-2 rounded-xl border border-border bg-surface p-3">
          <p className="text-sm font-medium text-fg">
            {t('playback')} <span className="tabular-nums text-muted">· {formatClock(elapsed)}</span>
          </p>
          <audio controls src={audioUrl} className="w-full" preload="metadata" />
          <Button variant="ghost" size="sm" leftIcon={<RotateCcw className="size-4" aria-hidden />} onClick={reset} disabled={disabled}>
            {t('reRecord')}
          </Button>
        </div>
      )}

      {notice && <p className="text-sm text-warning-ink" role="status">{t(notice)}</p>}
      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
