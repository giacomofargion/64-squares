import type { NoteMapping } from '@/types/audio';

// Column to note mapping (A-H → A, B♭, C, D, E, F, G, B)
const COLUMN_TO_NOTE: Record<string, { note: string; baseFreq: number }> = {
  A: { note: 'A', baseFreq: 440 }, // A4
  B: { note: 'Bb', baseFreq: 466.16 }, // B♭4
  C: { note: 'C', baseFreq: 523.25 }, // C5
  D: { note: 'D', baseFreq: 587.33 }, // D5
  E: { note: 'E', baseFreq: 659.25 }, // E5
  F: { note: 'F', baseFreq: 698.46 }, // F5
  G: { note: 'G', baseFreq: 783.99 }, // G5
  H: { note: 'B', baseFreq: 493.88 }, // B4
};

/**
 * Maps a chess square (e.g., "e4") to a musical note with octave and timbre variations
 * Row 1 = -2 octaves, Row 8 = +2 octaves (gradual progression)
 * Each row also has a different timbre index for synth parameter variation
 */
export function getNoteMapping(square: string): NoteMapping {
  const column = square[0].toUpperCase();
  const row = parseInt(square[1]);

  if (!COLUMN_TO_NOTE[column] || row < 1 || row > 8) {
    throw new Error(`Invalid square: ${square}`);
  }

  const { note, baseFreq } = COLUMN_TO_NOTE[column];

  // Octave offset: Row 1 = -2, Row 8 = +2, linear progression
  const octaveOffset = (row - 4.5) * (4 / 7); // Maps 1-8 to approximately -2 to +2

  // Calculate frequency with octave offset
  const frequency = baseFreq * Math.pow(2, octaveOffset);

  // Timbre index: 0-7 for different synth parameters per row
  const timbreIndex = row - 1;

  return {
    column,
    row,
    note: `${note}${Math.round(4 + octaveOffset)}`,
    frequency,
    octaveOffset,
    timbreIndex,
  };
}

/**
 * Gets all notes in a specific row (for capture events)
 */
export function getRowNotes(row: number): NoteMapping[] {
  const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  return columns.map(col => getNoteMapping(`${col}${row}`));
}

/**
 * Converts a square string to a note string for Tone.js
 */
export function squareToNote(square: string): string {
  const mapping = getNoteMapping(square);
  return mapping.note;
}

/**
 * Gets the column index (0-7) from a square string
 * A=0, B=1, C=2, D=3, E=4, F=5, G=6, H=7
 */
export function getColumnIndex(square: string): number {
  const column = square[0].toUpperCase();
  const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const index = columns.indexOf(column);
  if (index === -1) {
    throw new Error(`Invalid column: ${column}`);
  }
  return index;
}
