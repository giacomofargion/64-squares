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

  // Latest requested synth types, so the generator can be seeded with them without
  // making its creation depend on them. Declared before the creation effect so this
  // effect runs first and the refs are current when the generator is built.
  const ownSynthTypeRef = useRef(ownSynthType);
  const opponentSynthTypeRef = useRef(opponentSynthType);

  // Apply synth type changes in place. Each side is swapped independently, so
  // changing one instrument leaves the other side's ringing notes alone.
  useEffect(() => {
    ownSynthTypeRef.current = ownSynthType;
    opponentSynthTypeRef.current = opponentSynthType;

    const generator = dualSynthGeneratorRef.current;
    if (!generator) return;

    if (ownSynthType) {
      generator.setOwnSynthType(ownSynthType).catch(console.error);
    }
    if (opponentSynthType) {
      generator.setOpponentSynthType(opponentSynthType).catch(console.error);
    }
  }, [ownSynthType, opponentSynthType]);

  // The generator owns the Tone.js nodes for both players, so it is built once when
  // audio starts and only disposed when audio is torn down. Rebuilding it on every
  // synth type change used to cut off every note still ringing, including the
  // opponent's, and the opponent's type changes as soon as they join a match.
  useEffect(() => {
    if (!isInitialized) return;

    dualSynthGeneratorRef.current = new DualSynthGenerator(
      ownSynthTypeRef.current || 'Synth',
      opponentSynthTypeRef.current || 'Synth'
    );
    setIsReady(true);

    return () => {
      dualSynthGeneratorRef.current?.dispose();
      dualSynthGeneratorRef.current = null;
      setIsReady(false);
    };
  }, [isInitialized]);

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
