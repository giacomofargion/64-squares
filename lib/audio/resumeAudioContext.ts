import * as Tone from 'tone';
import { recordAudioEvent } from '@/lib/audio/audioDiagnostics';

/**
 * Browsers suspend the audio context when a text field is focused (the match
 * chat keyboard on mobile), when the tab is backgrounded, or after an
 * interruption. Suspended contexts ignore every note until resume() runs
 * inside a user gesture, which is why sound could die and never come back.
 */
export function resumeAudioContext(): void {
  const raw = Tone.getContext().rawContext;
  if (raw.state === 'running') return;
  recordAudioEvent(`resume requested while ${raw.state}`);
  void Tone.start();
}

export function isAudioContextRunning(): boolean {
  return Tone.getContext().rawContext.state === 'running';
}
