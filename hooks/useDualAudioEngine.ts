'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Tone from 'tone';
import type { SynthType } from '@/types/audio';
import { DualSynthGenerator } from '@/components/audio/DualSynthGenerator';
import { resumeAudioContext } from '@/lib/audio/resumeAudioContext';
import { recordAudioEvent } from '@/lib/audio/audioDiagnostics';
import { useAudioContextRunning } from '@/hooks/useAudioContextRunning';

export function useDualAudioEngine(
  ownSynthType: SynthType | null,
  opponentSynthType: SynthType | null
) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const dualSynthGeneratorRef = useRef<DualSynthGenerator | null>(null);

  const isRunning = useAudioContextRunning(isInitialized);

  // A second call has to resume a context the browser suspended after the
  // first enable (chat focus, background tab). Returning early left the
  // player with no way to start sound again.
  const initializeAudio = useCallback(async () => {
    if (!ownSynthType) {
      recordAudioEvent('enable ignored: own synth type not known yet');
      return false;
    }

    try {
      await Tone.start();
      const state = Tone.getContext().rawContext.state;
      recordAudioEvent(`enable: context ${state}`);
      if (!dualSynthGeneratorRef.current) {
        dualSynthGeneratorRef.current = new DualSynthGenerator(
          ownSynthType || 'Synth',
          opponentSynthType || 'Synth'
        );
      }
      if (!isInitialized) setIsInitialized(true);
      setIsReady(true);
      return state === 'running';
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      recordAudioEvent(`enable failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }, [isInitialized, ownSynthType, opponentSynthType]);

  // Apply synth type changes in place. Each side is swapped independently, so
  // changing one instrument leaves the other side's ringing notes alone.
  useEffect(() => {
    const generator = dualSynthGeneratorRef.current;
    if (!generator) return;

    if (ownSynthType) {
      generator.setOwnSynthType(ownSynthType).catch(console.error);
    }
    if (opponentSynthType) {
      generator.setOpponentSynthType(opponentSynthType).catch(console.error);
    }
  }, [ownSynthType, opponentSynthType]);

  // Built from the enable click, not from an effect, so a match update cannot
  // tear the graph down and silence whoever is still ringing. Disposal waits
  // until the page actually unmounts.
  useEffect(() => {
    return () => {
      dualSynthGeneratorRef.current?.dispose();
      dualSynthGeneratorRef.current = null;
    };
  }, []);

  const triggerOwnSquareNote = useCallback((square: string) => {
    // Incoming and local notes both try to wake a suspended context. Chrome
    // accepts that after the original gesture; iOS still needs the Resume tap.
    resumeAudioContext();
    dualSynthGeneratorRef.current?.triggerOwnSquareNote(square);
  }, []);

  const triggerOpponentSquareNote = useCallback((square: string) => {
    resumeAudioContext();
    dualSynthGeneratorRef.current?.triggerOpponentSquareNote(square);
  }, []);

  const triggerOwnRowCapture = useCallback((row: number) => {
    resumeAudioContext();
    dualSynthGeneratorRef.current?.triggerOwnRowCapture(row);
  }, []);

  const triggerOpponentRowCapture = useCallback((row: number) => {
    resumeAudioContext();
    dualSynthGeneratorRef.current?.triggerOpponentRowCapture(row);
  }, []);

  const stopAll = useCallback(() => {
    if (dualSynthGeneratorRef.current) {
      dualSynthGeneratorRef.current.stopAll();
    }
  }, []);

  const setOwnReverbAmount = useCallback((amount: number) => {
    if (dualSynthGeneratorRef.current) {
      dualSynthGeneratorRef.current.setOwnReverbAmount(amount);
    }
  }, []);

  const setOpponentReverbAmount = useCallback((amount: number) => {
    if (dualSynthGeneratorRef.current) {
      dualSynthGeneratorRef.current.setOpponentReverbAmount(amount);
    }
  }, []);

  const getOwnReverbAmount = useCallback((): number => {
    if (dualSynthGeneratorRef.current) {
      return dualSynthGeneratorRef.current.getOwnReverbAmount();
    }
    return 0.3; // Default
  }, []);

  const getOpponentReverbAmount = useCallback((): number => {
    if (dualSynthGeneratorRef.current) {
      return dualSynthGeneratorRef.current.getOpponentReverbAmount();
    }
    return 0.3; // Default
  }, []);

  return {
    isReady,
    isInitialized,
    isRunning,
    initializeAudio,
    triggerOwnSquareNote,
    triggerOpponentSquareNote,
    triggerOwnRowCapture,
    triggerOpponentRowCapture,
    stopAll,
    setOwnReverbAmount,
    setOpponentReverbAmount,
    getOwnReverbAmount,
    getOpponentReverbAmount,
  };
}
