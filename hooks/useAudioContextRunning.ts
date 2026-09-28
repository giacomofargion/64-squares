'use client';

import { useEffect, useState } from 'react';
import * as Tone from 'tone';
import { resumeAudioContext } from '@/lib/audio/resumeAudioContext';
import { recordAudioEvent } from '@/lib/audio/audioDiagnostics';

/**
 * Tracks whether the audio context is actually producing sound, and wakes it
 * on the next tap, key press, or return to the tab once the player has
 * enabled audio. The enable button can then come back as "Resume audio"
 * if the context drops out mid-game.
 */
export function useAudioContextRunning(audioEnabled: boolean): boolean {
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const raw = Tone.getContext().rawContext;
    const sync = () => setIsRunning(raw.state === 'running');
    const onStateChange = () => {
      recordAudioEvent(`context ${raw.state}`);
      sync();
    };
    raw.addEventListener('statechange', onStateChange);
    sync();

    if (!audioEnabled) {
      return () => raw.removeEventListener('statechange', onStateChange);
    }

    const resume = () => resumeAudioContext();
    const onVisible = () => {
      if (document.visibilityState === 'visible') resumeAudioContext();
    };

    window.addEventListener('pointerdown', resume, true);
    window.addEventListener('keydown', resume, true);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      raw.removeEventListener('statechange', onStateChange);
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [audioEnabled]);

  return isRunning;
}
