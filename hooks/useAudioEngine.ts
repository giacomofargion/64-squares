'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Tone from 'tone';
import type { SynthType } from '@/types/audio';
import { SoundGenerator } from '@/components/audio/SoundGenerator';

export function useAudioEngine(synthType: SynthType | null, playerColor: 'w' | 'b' | null) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const soundGeneratorRef = useRef<SoundGenerator | null>(null);

  // Manual initialization function (call on user interaction)
  const initializeAudio = useCallback(async () => {
    if (isInitialized || !synthType || !playerColor) return false;

    try {
      // Start Tone.js context (requires user interaction)
      await Tone.start();
      setIsInitialized(true);
      return true;
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      return false;
    }
  }, [isInitialized, synthType, playerColor]);

  // Create sound generator when initialized
  useEffect(() => {
    if (isInitialized && synthType && !soundGeneratorRef.current) {
      soundGeneratorRef.current = new SoundGenerator(synthType);
      setIsReady(true);
    }

    // Update synth type if it changes
    if (soundGeneratorRef.current && synthType && soundGeneratorRef.current.getSynthType() !== synthType) {
      soundGeneratorRef.current.setSynthType(synthType);
    }

    return () => {
      if (soundGeneratorRef.current) {
        soundGeneratorRef.current.dispose();
        soundGeneratorRef.current = null;
        setIsReady(false);
      }
    };
  }, [isInitialized, synthType]);

  const triggerSquareNote = useCallback((square: string) => {
    if (soundGeneratorRef.current && isReady) {
      soundGeneratorRef.current.triggerSquareNote(square);
    }
  }, [isReady]);

  const triggerRowCapture = useCallback((row: number) => {
    if (soundGeneratorRef.current && isReady) {
      soundGeneratorRef.current.triggerRowCapture(row);
    }
  }, [isReady]);

  const stopAll = useCallback(() => {
    if (soundGeneratorRef.current) {
      soundGeneratorRef.current.stopAll();
    }
  }, []);

  return {
    isReady,
    isInitialized,
    initializeAudio,
    triggerSquareNote,
    triggerRowCapture,
    stopAll,
  };
}
