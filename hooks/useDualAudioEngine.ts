'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Tone from 'tone';
import type { SynthType } from '@/types/audio';
import { DualSynthGenerator } from '@/components/audio/DualSynthGenerator';

export function useDualAudioEngine(
  ownSynthType: SynthType | null,
  opponentSynthType: SynthType | null
) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const dualSynthGeneratorRef = useRef<DualSynthGenerator | null>(null);

  // Manual initialization function (call on user interaction)
  const initializeAudio = useCallback(async () => {
    if (isInitialized || !ownSynthType) return false; // Only need own synth type to initialize

    try {
      // Start Tone.js context (requires user interaction)
      await Tone.start();
      setIsInitialized(true);
      return true;
    } catch (error) {
      console.error('Failed to initialize audio context:', error);
      return false;
    }
  }, [isInitialized, ownSynthType]);

  // Create dual synth generator when initialized
  useEffect(() => {
    // Initialize with both synth types (use 'Synth' as default if opponent type not available yet)
    const effectiveOwnSynth = ownSynthType || 'Synth';
    const effectiveOpponentSynth = opponentSynthType || 'Synth';

    if (isInitialized && !dualSynthGeneratorRef.current) {
      dualSynthGeneratorRef.current = new DualSynthGenerator(effectiveOwnSynth, effectiveOpponentSynth);
      setIsReady(true);
    }

    // Update synth types if they change (async)
    if (dualSynthGeneratorRef.current) {
      if (ownSynthType) {
        dualSynthGeneratorRef.current.setOwnSynthType(ownSynthType).catch(console.error);
      }
      // Always update opponent synth type when it changes (even if it's the same initially)
      // This ensures it updates when opponent joins
      if (opponentSynthType) {
        dualSynthGeneratorRef.current.setOpponentSynthType(opponentSynthType).catch(console.error);
        console.log('Updated opponent synth in dual generator:', opponentSynthType);
      }
    }

    return () => {
      if (dualSynthGeneratorRef.current) {
        dualSynthGeneratorRef.current.dispose();
        dualSynthGeneratorRef.current = null;
        setIsReady(false);
      }
    };
  }, [isInitialized, ownSynthType, opponentSynthType]);

  const triggerOwnSquareNote = useCallback((square: string) => {
    if (dualSynthGeneratorRef.current && isReady) {
      dualSynthGeneratorRef.current.triggerOwnSquareNote(square);
    }
  }, [isReady]);

  const triggerOpponentSquareNote = useCallback((square: string) => {
    if (dualSynthGeneratorRef.current && isReady) {
      dualSynthGeneratorRef.current.triggerOpponentSquareNote(square);
    }
  }, [isReady]);

  const triggerOwnRowCapture = useCallback((row: number) => {
    if (dualSynthGeneratorRef.current && isReady) {
      dualSynthGeneratorRef.current.triggerOwnRowCapture(row);
    }
  }, [isReady]);

  const triggerOpponentRowCapture = useCallback((row: number) => {
    if (dualSynthGeneratorRef.current && isReady) {
      dualSynthGeneratorRef.current.triggerOpponentRowCapture(row);
    }
  }, [isReady]);

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
