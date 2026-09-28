'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import * as Tone from 'tone';
import {
  readAudioEvents,
  readServerAudioEvents,
  subscribeToAudioEvents,
} from '@/lib/audio/audioDiagnostics';

interface AudioDebugPanelProps {
  ownSynthType: string | null;
  opponentSynthType: string | null;
}

interface OutputStatus {
  sampledAt: number;
  contextState: string;
  sampleRate: number;
  muted: boolean;
  volumeDb: number;
  level: number;
}

const INITIAL_STATUS: OutputStatus = {
  sampledAt: 0,
  contextState: 'unknown',
  sampleRate: 0,
  muted: false,
  volumeDb: 0,
  level: 0,
};

export function AudioDebugPanel({ ownSynthType, opponentSynthType }: AudioDebugPanelProps) {
  const events = useSyncExternalStore(subscribeToAudioEvents, readAudioEvents, readServerAudioEvents);
  const [status, setStatus] = useState<OutputStatus>(INITIAL_STATUS);

  useEffect(() => {
    // Listens on Tone's master output, which is what the speakers get.
    const meter = new Tone.Meter({ normalRange: true, smoothing: 0.6 });
    const destination = Tone.getDestination();
    destination.connect(meter);
    const raw = Tone.getContext().rawContext;

    const interval = setInterval(() => {
      const value = meter.getValue();
      setStatus({
        sampledAt: Date.now(),
        contextState: raw.state,
        sampleRate: raw.sampleRate,
        muted: destination.mute,
        volumeDb: destination.volume.value,
        level: Array.isArray(value) ? Math.max(...value) : value,
      });
    }, 100);

    return () => {
      clearInterval(interval);
      destination.disconnect(meter);
      meter.dispose();
    };
  }, []);

  const recentEvents = events.slice(-12).reverse();

  return (
    <aside
      aria-label="Audio diagnostics"
      className="fixed bottom-2 left-2 z-50 w-[min(24rem,calc(100vw-1rem))] rounded-md border border-border bg-background/95 p-3 font-mono text-[11px] leading-snug text-foreground shadow-lg"
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold">audio debug</span>
        <span className={status.contextState === 'running' ? 'text-emerald-500' : 'text-red-500'}>
          context {status.contextState}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="w-14 text-muted-foreground">output</span>
        <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
          <div
            className="h-full bg-emerald-500 transition-[width] duration-100"
            style={{ width: `${Math.min(100, status.level * 300).toFixed(0)}%` }}
          />
        </div>
        <span className="w-12 text-right">{status.level.toFixed(3)}</span>
      </div>
      <div className="mt-1 text-muted-foreground">
        {status.sampleRate ? `${status.sampleRate} Hz` : '—'} · mute {status.muted ? 'ON' : 'off'} · volume{' '}
        {Number.isFinite(status.volumeDb) ? `${status.volumeDb.toFixed(0)} dB` : '—'}
      </div>
      <div className="mt-1">
        own <span className="font-semibold">{ownSynthType ?? '—'}</span> · opponent{' '}
        <span className="font-semibold">{opponentSynthType ?? '—'}</span>
      </div>
      <ol className="mt-2 max-h-40 space-y-0.5 overflow-y-auto border-t border-border pt-1">
        {recentEvents.length === 0 && <li className="text-muted-foreground">no audio events yet</li>}
        {recentEvents.map((event) => (
          <li key={`${event.at}-${event.message}`} className="flex gap-2">
            <span className="w-10 shrink-0 text-right text-muted-foreground">
              -{(Math.max(0, status.sampledAt - event.at) / 1000).toFixed(0)}s
            </span>
            <span className="truncate">{event.message}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}
