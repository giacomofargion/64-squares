export type SynthType = 'Synth' | 'AMSynth' | 'FMSynth' | 'DuoSynth' | 'MonoSynth' | 'MembraneSynth';

export interface NoteMapping {
  column: string; // A-H
  row: number; // 1-8
  note: string; // e.g., "A4"
  frequency: number; // Hz
  octaveOffset: number; // -2 to +2
  timbreIndex: number; // 0-7 for timbral variation
}

export interface SoundEvent {
  square: string; // e.g., "e4"
  note: string;
  frequency: number;
  duration: number; // 20 seconds
  startTime: number;
  synthType: SynthType;
}
