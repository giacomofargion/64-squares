import * as Tone from 'tone';
import type { SynthType } from '@/types/audio';
import { getNoteMapping, getRowNotes, squareToNote, getColumnIndex } from '@/lib/audio/noteMapping';
import { getSynthConstructor, getTimbreParams, getRowBaseTimbreParams } from '@/lib/audio/synthConfig';

export class SoundGenerator {
  private rowSynths: Tone.PolySynth<Tone.Synth>[] = []; // Array of 8 PolySynths (one per row)
  private rowLFOs: Tone.LFO[] = []; // Array of 8 LFOs (one per row) for amplitude modulation
  private reverb!: Tone.Reverb;
  private limiter!: Tone.Limiter;
  private synthType: SynthType;
  private activeNotes: Map<string, number> = new Map();
  private reverbAmount: number = 0.7; // High reverb built-in (was 0.3)
  private reverbReady: boolean = false;
  private readonly NOTE_DURATION = 20; // 20 seconds

  constructor(synthType: SynthType = 'Synth') {
    this.synthType = synthType;
    this.initializeAudioChainSync();
    // Generate reverb asynchronously (non-blocking)
    this.initializeReverbAsync();
  }

  /**
   * Initialize the audio chain synchronously: 8 PolySynths (one per row) → Reverb → Limiter → Destination
   * Each PolySynth is initialized with row-specific timbre parameters
   */
  private initializeAudioChainSync(): void {
    const SynthConstructor = getSynthConstructor(this.synthType);

    // Create shared reverb with very high decay (30 seconds) for ambient, evolving sound
    this.reverb = new Tone.Reverb({
      decay: 30,
      wet: this.reverbAmount,
    });

    // Create shared limiter to prevent distortion (-1dB threshold)
    this.limiter = new Tone.Limiter(-1);

    // Connect reverb → limiter → destination
    this.reverb.connect(this.limiter);
    this.limiter.toDestination();

    // Create 8 PolySynths, one for each row (rows 1-8, indices 0-7)
    for (let rowIndex = 0; rowIndex < 8; rowIndex++) {
      // Get base timbre parameters for this row (without column detuning)
      const rowTimbreParams = getRowBaseTimbreParams(rowIndex);

      // Create PolySynth with row-specific parameters
      // Max 8 voices per row (one per column)
      const rowPolySynth = new Tone.PolySynth({
        maxPolyphony: 8,
        voice: SynthConstructor,
        options: {
          oscillator: rowTimbreParams.oscillator,
          envelope: rowTimbreParams.envelope,
        },
      });

      // Create LFO for this row with row-specific frequency
      // LFO frequencies: 0.1 Hz (row 1) to 2.0 Hz (row 8) for different modulation speeds
      // Lower rows = slower LFO, higher rows = faster LFO
      const rowFactor = (7 - rowIndex) / 7; // 1.0 for row 0, 0.0 for row 7
      const lfoFrequency = 0.1 + (rowFactor * 1.9); // 0.1 to 2.0 Hz

      const rowLFO = new Tone.LFO({
        frequency: lfoFrequency,
        min: -8,  // Minimum volume modulation (dB)
        max: -2,   // Maximum volume modulation (dB)
      });

      // Connect LFO to modulate the PolySynth's volume
      // This creates a tremolo effect that varies by row
      rowLFO.connect(rowPolySynth.volume);
      rowLFO.start(); // Start the LFO

      // Connect this row's PolySynth to the shared reverb
      rowPolySynth.connect(this.reverb);

      // Set base volume (LFO will modulate around this)
      rowPolySynth.volume.value = -25; // Lowered from -12 to reduce overall volume

      this.rowSynths[rowIndex] = rowPolySynth;
      this.rowLFOs[rowIndex] = rowLFO;
    }
  }

  /**
   * Generate reverb impulse response asynchronously
   */
  private async initializeReverbAsync(): Promise<void> {
    try {
      await this.reverb.generate();
      this.reverbReady = true;
      // Set reverb amount once ready
      this.reverb.wet.value = this.reverbAmount;
    } catch (error) {
      console.error('Error generating reverb:', error);
      // Continue without reverb if generation fails
      this.reverbReady = false;
    }
  }

  /**
   * Triggers a note for a chess square move
   * Routes the note to the appropriate row's PolySynth
   * Applies column-based detuning per note
   */
  triggerSquareNote(square: string, time?: Tone.Unit.Time): void {
    try {
      const note = squareToNote(square);
      const mapping = getNoteMapping(square);
      const columnIndex = getColumnIndex(square);
      const rowIndex = mapping.row - 1; // Row 1-8 → index 0-7

      // Get the PolySynth for this row (already configured with row-specific timbre)
      const rowPolySynth = this.rowSynths[rowIndex];
      if (!rowPolySynth) {
        console.error(`No PolySynth found for row ${mapping.row}`);
        return;
      }

      // Get column-based detuning (only detune varies per note)
      const timbreParams = getTimbreParams(mapping.timbreIndex, columnIndex);
      const detune = timbreParams.detune || 0;

      const triggerTime = time || Tone.now();

      // Trigger the note with column-based detuning
      // No need to update parameters - each row's PolySynth already has correct timbre!
      if (detune !== 0) {
        // Calculate detuned frequency: convert cents to frequency ratio
        const baseFreq = Tone.Frequency(note).toFrequency();
        const detunedFreq = baseFreq * Math.pow(2, detune / 1200);
        rowPolySynth.triggerAttackRelease(detunedFreq, this.NOTE_DURATION, triggerTime);
      } else {
        rowPolySynth.triggerAttackRelease(note, this.NOTE_DURATION, triggerTime);
      }

      // Track active note
      const endTime = Tone.Time(triggerTime).toSeconds() + this.NOTE_DURATION;
      this.activeNotes.set(square, endTime);
    } catch (error) {
      console.error(`Error triggering note for square ${square}:`, error);
    }
  }

  /**
   * Triggers all 8 notes in a row with randomized stagger and direction (for capture events)
   * Randomizes speed (20-80ms) and direction (up or down)
   * Uses the row-specific PolySynth for all notes in the row
   */
  triggerRowCapture(row: number, time?: Tone.Unit.Time): void {
    const rowNotes = getRowNotes(row);
    const triggerTime = time || Tone.now();
    const rowIndex = row - 1; // Row 1-8 → index 0-7

    // Get the PolySynth for this row
    const rowPolySynth = this.rowSynths[rowIndex];
    if (!rowPolySynth) {
      console.error(`No PolySynth found for row ${row}`);
      return;
    }

    // Randomize direction: 50% chance to play in reverse (H→A)
    const playReverse = Math.random() < 0.5;
    const orderedNotes = playReverse ? [...rowNotes].reverse() : rowNotes;

    // Randomize stagger delay: 20-80ms
    const minDelay = 0.02; // 20ms
    const maxDelay = 0.08; // 80ms

    orderedNotes.forEach((mapping, index) => {
      const note = mapping.note;
      // Randomize delay for each note within the range
      const randomDelay = minDelay + Math.random() * (maxDelay - minDelay);
      const delay = index * randomDelay + (Math.random() * 0.01); // Add slight extra randomization
      const noteTime = Tone.Time(triggerTime).toSeconds() + delay;

      // Get column index for detuning
      const column = mapping.column;
      const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      const columnIndex = columns.indexOf(column);
      const timbreParams = getTimbreParams(mapping.timbreIndex, columnIndex);
      const detune = timbreParams.detune || 0;

      // Trigger each note with column-based detuning
      // No parameter updates needed - row PolySynth already has correct timbre!
      if (detune !== 0) {
        // Calculate detuned frequency: convert cents to frequency ratio
        const baseFreq = Tone.Frequency(note).toFrequency();
        const detunedFreq = baseFreq * Math.pow(2, detune / 1200);
        rowPolySynth.triggerAttackRelease(detunedFreq, this.NOTE_DURATION, noteTime);
      } else {
        rowPolySynth.triggerAttackRelease(note, this.NOTE_DURATION, noteTime);
      }
    });
  }

  /**
   * Stops all active notes from all row PolySynths
   */
  stopAll(): void {
    this.rowSynths.forEach((rowPolySynth) => {
      rowPolySynth.releaseAll();
    });
    this.activeNotes.clear();
  }

  /**
   * Updates the synth type (recreates entire audio chain)
   */
  async setSynthType(synthType: SynthType): Promise<void> {
    if (this.synthType === synthType) return;

    // Stop all current notes
    this.stopAll();

    // Dispose old audio chain
    this.rowSynths.forEach((rowPolySynth) => {
      rowPolySynth.dispose();
    });
    this.rowLFOs.forEach((rowLFO) => {
      rowLFO.dispose();
    });
    this.rowSynths = [];
    this.rowLFOs = [];
    this.reverb.dispose();
    this.limiter.dispose();

    // Create new audio chain
    this.synthType = synthType;
    this.initializeAudioChainSync();
    await this.initializeReverbAsync();
  }

  /**
   * Sets the reverb amount (0-1)
   */
  setReverbAmount(amount: number): void {
    this.reverbAmount = Math.max(0, Math.min(1, amount)); // Clamp to 0-1
    if (this.reverbReady) {
      this.reverb.wet.value = this.reverbAmount;
    }
  }

  /**
   * Gets the current reverb amount
   */
  getReverbAmount(): number {
    return this.reverbAmount;
  }

  /**
   * Gets the current synth type
   */
  getSynthType(): SynthType {
    return this.synthType;
  }

  /**
   * Cleanup - dispose of all resources
   */
  dispose(): void {
    this.stopAll();
    this.rowSynths.forEach((rowPolySynth) => {
      rowPolySynth.dispose();
    });
    this.rowLFOs.forEach((rowLFO) => {
      rowLFO.dispose();
    });
    this.rowSynths = [];
    this.rowLFOs = [];
    this.reverb.dispose();
    this.limiter.dispose();
  }
}
