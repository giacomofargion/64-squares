import type { SynthType } from '@/types/audio';
import * as Tone from 'tone';

/**
 * Gets the Tone.js synth constructor for a given synth type
 * Note: Return type is intentionally flexible due to Tone.js type system limitations
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSynthConstructor(synthType: SynthType): any {
  switch (synthType) {
    case 'AMSynth':
      return Tone.AMSynth;
    case 'FMSynth':
      return Tone.FMSynth;
    case 'DuoSynth':
      return Tone.DuoSynth;
    case 'MonoSynth':
      return Tone.MonoSynth;
    case 'MembraneSynth':
      return Tone.MembraneSynth;
    case 'Synth':
    default:
      return Tone.Synth;
  }
}

/**
 * Gets timbre-specific parameters for a synth based on row (0-7)
 * This creates variation in sound across different rows
 * Enhanced with more oscillator types and ambient attack/release times
 */
export function getTimbreParams(timbreIndex: number, columnIndex?: number): Partial<Tone.SynthOptions> & { detune?: number } {
  // Expanded oscillator types for more variety
  // Note: Some types may not be available in all Tone.js versions, but will be handled gracefully
  const oscillatorTypes: (Tone.ToneOscillatorType | string)[] = [
    'sine',
    'triangle',
    'sawtooth',
    'square',
    'pulse',
    'pwm',
    'fatsawtooth',
    'fatsquare'
  ];
  const oscillatorType = oscillatorTypes[timbreIndex % oscillatorTypes.length];

  // Ambient attack/release: lower rows = longer attack/release for ambient pad-like sounds
  // Attack: 0.5s to 3s, Release: 15s to 25s (much longer for continuous, evolving sound)
  // Row factor: lower rows (0-3) have longer times, higher rows (4-7) have shorter
  const rowFactor = (7 - timbreIndex) / 7; // 1.0 for row 0, 0.0 for row 7
  const baseAttack = 0.5 + (rowFactor * 2.5); // 0.5 to 3.0
  const baseRelease = 15.0 + (rowFactor * 10.0); // 15.0 to 25.0 (much longer release for less silence)

  // No randomness - deterministic values for manual adjustment
  const attackVariation = baseAttack;
  const releaseVariation = baseRelease;

  // Decay and sustain variations
  // Very long decay: 5.0s to 15.0s for more ambient, evolving sound
  const decayVariation = 5.0 + (rowFactor * 10.0); // 5.0 to 15.0 seconds
  const sustainVariation = 0.3 + (timbreIndex * 0.03);

  // Calculate detuning based on column position (fixed 3 cents per column offset)
  // Column A=0, B=1, ..., H=7
  let detune = 0;
  if (columnIndex !== undefined) {
    const detunePerColumn = 3; // Fixed 3 cents per column
    detune = (columnIndex - 3.5) * detunePerColumn; // Centered around middle columns
  }

  // Type assertions needed due to Tone.js type system limitations
  // The oscillator and envelope types vary by synth type, so we use flexible typing
  return {
    oscillator: {
      type: oscillatorType as Tone.ToneOscillatorType,
    },
    envelope: {
      attack: Math.max(0.1, attackVariation), // Ensure minimum 0.1s
      decay: decayVariation,
      sustain: sustainVariation,
      release: Math.max(0.5, releaseVariation), // Ensure minimum 0.5s
    },
    detune: Math.round(detune), // Round to nearest cent
  } as Partial<Tone.SynthOptions> & { detune?: number };
}

/**
 * Gets base timbre parameters for a row (without column-based detuning)
 * Used for initializing row-specific PolySynth instances
 */
export function getRowBaseTimbreParams(timbreIndex: number): Partial<Tone.SynthOptions> {
  // Custom oscillator type mapping - sine is on row 1 (index 0)
  const oscillatorTypeMap: (Tone.ToneOscillatorType | string)[] = [
    'sine',        // Row 1 (index 0)
    'triangle',    // Row 2 (index 1)
    'sawtooth',    // Row 3 (index 2)
    'square',      // Row 4 (index 3)
    'pulse',       // Row 5 (index 4)
    'pwm',         // Row 6 (index 5)
    'fatsawtooth', // Row 7 (index 6)
    'fatsquare'    // Row 8 (index 7)
  ];
  const oscillatorType = oscillatorTypeMap[timbreIndex];

  // Row factor: lower rows (0-3) have longer times, higher rows (4-7) have shorter
  const rowFactor = (7 - timbreIndex) / 7; // 1.0 for row 0, 0.0 for row 7
  const baseAttack = 0.5 + (rowFactor * 2.5); // 0.5 to 3.0
  const baseRelease = 15.0 + (rowFactor * 10.0); // 15.0 to 25.0
  const decayVariation = 5.0 + (rowFactor * 10.0); // 5.0 to 15.0 seconds
  const sustainVariation = 0.3 + (timbreIndex * 0.03);

  return {
    oscillator: {
      type: oscillatorType as Tone.ToneOscillatorType,
    },
    envelope: {
      attack: Math.max(0.1, baseAttack),
      decay: decayVariation,
      sustain: sustainVariation,
      release: Math.max(0.5, baseRelease),
    },
  } as Partial<Tone.SynthOptions>;
}

/**
 * Available synth types for selection
 */
export const AVAILABLE_SYNTH_TYPES: SynthType[] = [
  'Synth',
  'FMSynth',
  'AMSynth',
  'MembraneSynth',
];
