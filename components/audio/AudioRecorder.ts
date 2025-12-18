import * as Tone from 'tone';
import { SoundGenerator } from './SoundGenerator';
import { squareToNote } from '@/lib/audio/noteMapping';
import type { SynthType } from '@/types/audio';
import type { MoveRecord } from '@/types/match';

interface AudioRecorderOptions {
  synthType: SynthType;
  sampleRate?: number;
}

/**
 * Records chess game audio by replaying moves using Tone.js OfflineContext
 */
export class AudioRecorder {
  private synthType: SynthType;
  private sampleRate: number;

  constructor(options: AudioRecorderOptions) {
    this.synthType = options.synthType;
    this.sampleRate = options.sampleRate || 44100;
  }

  /**
   * Records game audio by replaying all moves
   */
  async recordGame(moves: MoveRecord[], duration: number): Promise<Blob> {
    // Create offline context
    const offlineContext = new Tone.OfflineContext(2, duration, this.sampleRate);
    const originalContext = Tone.getContext();

    // Temporarily replace context
    (Tone as any).setContext(offlineContext);

    try {
      // Create sound generator with offline context
      const soundGenerator = new SoundGenerator(this.synthType);

      // Replay all moves
      let currentTime = 0;
      for (const move of moves) {
        const moveTime = currentTime;

        // Trigger note for destination square
        soundGenerator.triggerSquareNote(move.move_to, moveTime);

        // If capture, trigger row capture
        if (move.captured_piece) {
          const row = parseInt(move.move_to[1]);
          soundGenerator.triggerRowCapture(row, moveTime);
        }

        // Advance time (approximate - in real game, moves happen at different intervals)
        currentTime += 2; // 2 seconds between moves (adjust as needed)
      }

      // Render audio
      const toneBuffer = await offlineContext.render();

      // Get the underlying AudioBuffer from ToneAudioBuffer
      // ToneAudioBuffer.get() returns the native AudioBuffer, or we can access ._buffer
      const buffer: AudioBuffer = (
        (toneBuffer as any).get?.() ||
        (toneBuffer as any)._buffer ||
        toneBuffer
      ) as AudioBuffer;

      // Convert to WAV
      const wav = this.bufferToWav(buffer);

      return new Blob([wav], { type: 'audio/wav' });
    } finally {
      // Restore original context
      (Tone as any).setContext(originalContext);
    }
  }

  /**
   * Converts AudioBuffer to WAV format
   */
  private bufferToWav(buffer: AudioBuffer): ArrayBuffer {
    const length = buffer.length;
    const numberOfChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bytesPerSample = 2;
    const blockAlign = numberOfChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const bufferSize = 44 + dataSize;

    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Convert float samples to 16-bit PCM
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return arrayBuffer;
  }

  /**
   * Uploads WAV file to Supabase Storage
   */
  async uploadToSupabase(blob: Blob, matchId: string, supabaseClient: any): Promise<string> {
    const fileName = `${matchId}-${Date.now()}.wav`;
    const filePath = `audio/${fileName}`;

    const { data, error } = await supabaseClient.storage
      .from('audio-files')
      .upload(filePath, blob, {
        contentType: 'audio/wav',
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload audio: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabaseClient.storage
      .from('audio-files')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }
}
