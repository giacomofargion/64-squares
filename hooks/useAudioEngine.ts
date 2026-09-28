'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Tone from 'tone';
import type { SynthType } from '@/types/audio';
import { SoundGenerator } from '@/components/audio/SoundGenerator';
import { resumeAudioContext } from '@/lib/audio/resumeAudioContext';
import { useAudioContextRunning } from '@/hooks/useAudioContextRunning';

export function useAudioEngine(synthType: SynthType | null, playerColor: 'w' | 'b' | null) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const soundGeneratorRef = useRef<SoundGenerator | null>(null);

  const isRunning = useAudioContextRunning(isInitialized);

  const initializeAudio = useCallback(async () => {
    if (!synthType || !playerColor) return false;

    try {
      await Tone.start();
      if (!soundGeneratorRef.current) {
        soundGeneratorRef.current = new SoundGenerator(synthType);
      }
      if (!isInitialized) setIsInitialized(true);
      setIsReady(true);
      return Tone.getContext().rawContext.state === 'running';
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      return false;
    }
  }, [isInitialized, synthType, playerColor]);

  useEffect(() => {
    if (soundGeneratorRef.current && synthType && soundGeneratorRef.current.getSynthType() !== synthType) {
      void soundGeneratorRef.current.setSynthType(synthType);
    }
  }, [synthType]);

  useEffect(() => {
    return () => {
      soundGeneratorRef.current?.dispose();
      soundGeneratorRef.current = null;
    };
  }, []);

  const triggerSquareNote = useCallback((square: string) => {
    resumeAudioContext();
    soundGeneratorRef.current?.triggerSquareNote(square);
  }, []);

  const triggerRowCapture = useCallback((row: number) => {
    resumeAudioContext();
    soundGeneratorRef.current?.triggerRowCapture(row);
  }, []);

  const stopAll = useCallback(() => {
    if (soundGeneratorRef.current) {
      soundGeneratorRef.current.stopAll();
    }
  }, []);

  return {
    isReady,
    isInitialized,
    isRunning,
    initializeAudio,
    triggerSquareNote,
    triggerRowCapture,
    stopAll,
  };
}
