import * as Tone from 'tone';
import type { SynthType } from '@/types/audio';
import { SoundGenerator } from './SoundGenerator';
import { squareToNote } from '@/lib/audio/noteMapping';
import { getRowNotes } from '@/lib/audio/noteMapping';

/**
 * Manages two SoundGenerator instances for dual-synth support
 * Both synths play simultaneously - one for own moves, one for opponent moves
 */
export class DualSynthGenerator {
  private ownSynth: SoundGenerator;
  private opponentSynth: SoundGenerator;
  private readonly NOTE_DURATION = 20; // 20 seconds

  constructor(ownSynthType: SynthType, opponentSynthType: SynthType) {
    this.ownSynth = new SoundGenerator(ownSynthType);
    this.opponentSynth = new SoundGenerator(opponentSynthType);
  }

  /**
   * Trigger a note for own move (uses own synth)
   */
  triggerOwnSquareNote(square: string): void {
    this.ownSynth.triggerSquareNote(square);
  }

  /**
   * Trigger a note for opponent move (uses opponent synth)
   */
  triggerOpponentSquareNote(square: string): void {
    this.opponentSynth.triggerSquareNote(square);
  }

  /**
   * Trigger row capture for own move (uses own synth)
   */
  triggerOwnRowCapture(row: number): void {
    this.ownSynth.triggerRowCapture(row);
  }

  /**
   * Trigger row capture for opponent move (uses opponent synth)
   */
  triggerOpponentRowCapture(row: number): void {
    this.opponentSynth.triggerRowCapture(row);
  }

  /**
   * Update own synth type
   */
  async setOwnSynthType(synthType: SynthType): Promise<void> {
    await this.ownSynth.setSynthType(synthType);
  }

  /**
   * Update opponent synth type
   */
  async setOpponentSynthType(synthType: SynthType): Promise<void> {
    await this.opponentSynth.setSynthType(synthType);
  }

  /**
   * Set reverb amount for own synth (0-1)
   */
  setOwnReverbAmount(amount: number): void {
    this.ownSynth.setReverbAmount(amount);
  }

  /**
   * Set reverb amount for opponent synth (0-1)
   */
  setOpponentReverbAmount(amount: number): void {
    this.opponentSynth.setReverbAmount(amount);
  }

  /**
   * Get reverb amount for own synth
   */
  getOwnReverbAmount(): number {
    return this.ownSynth.getReverbAmount();
  }

  /**
   * Get reverb amount for opponent synth
   */
  getOpponentReverbAmount(): number {
    return this.opponentSynth.getReverbAmount();
  }

  /**
   * Stop all notes from both synths
   */
  stopAll(): void {
    this.ownSynth.stopAll();
    this.opponentSynth.stopAll();
  }

  /**
   * Dispose both synths
   */
  dispose(): void {
    this.ownSynth.dispose();
    this.opponentSynth.dispose();
  }
}
