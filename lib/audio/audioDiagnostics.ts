export interface AudioDiagnosticEvent {
  at: number;
  message: string;
}

const MAX_EVENTS = 40;
const EMPTY: AudioDiagnosticEvent[] = [];

let events: AudioDiagnosticEvent[] = EMPTY;
const listeners = new Set<() => void>();

/**
 * Rolling log of what the audio engine did (instruments built or torn down,
 * notes released, context state changes). Shown by the `?audiodebug=1`
 * panel so a silent device can report where the chain broke.
 */
export function recordAudioEvent(message: string): void {
  events = [...events.slice(-(MAX_EVENTS - 1)), { at: Date.now(), message }];
  listeners.forEach((listener) => listener());
}

export function subscribeToAudioEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readAudioEvents(): AudioDiagnosticEvent[] {
  return events;
}

export function readServerAudioEvents(): AudioDiagnosticEvent[] {
  return EMPTY;
}
