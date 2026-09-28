import { createRoot } from 'react-dom/client';
import * as Tone from 'tone';
import { TooltipProvider } from '@/components/ui/tooltip';
import MatchPage from '@/app/(dashboard)/match/[id]/page';
import { SoundGenerator } from '@/components/audio/SoundGenerator';
import { DualSynthGenerator } from '@/components/audio/DualSynthGenerator';
import { setGuestName } from '@/lib/guestSession';
import { ChessGame } from '@/lib/chess/game';
import { log } from './probe-log';

type OutputSample = { t: number; rms: number };
type OutputProbe = { samples: OutputSample[]; contextState: string };

// Listens to what the page actually sends to the speakers. Counting note
// triggers proved insufficient: a graph can fire every trigger and still be
// silent. Tapped from Tone's master output because the limiter connects to
// Tone.Destination, not straight to the raw destination.
const outputProbe: OutputProbe = { samples: [], contextState: 'unknown' };
(window as unknown as { __output: OutputProbe }).__output = outputProbe;
let meter: Tone.Meter | null = null;

function ensureOutputMeter(): void {
  if (meter) return;
  meter = new Tone.Meter({ normalRange: true, smoothing: 0 });
  Tone.getDestination().connect(meter);
  const raw = Tone.getContext().rawContext;
  outputProbe.contextState = raw.state;
  raw.addEventListener('statechange', () => {
    outputProbe.contextState = raw.state;
    log(`CTX_STATE ${raw.state}`);
  });
  setInterval(() => {
    const value = meter?.getValue();
    const rms = Array.isArray(value) ? Math.max(...value) : (value ?? 0);
    outputProbe.samples.push({ t: Date.now(), rms });
    if (outputProbe.samples.length > 4000) outputProbe.samples.shift();
  }, 50);
}

const originalStopAll = SoundGenerator.prototype.stopAll;
SoundGenerator.prototype.stopAll = function patched(this: SoundGenerator) {
  log(`!!! STOP_ALL synthType=${this.getSynthType()}`);
  return originalStopAll.call(this);
};

const originalSetSynthType = SoundGenerator.prototype.setSynthType;
SoundGenerator.prototype.setSynthType = function patched(this: SoundGenerator, synthType) {
  if (this.getSynthType() !== synthType) {
    log(`SET_SYNTH_TYPE ${this.getSynthType()} -> ${synthType}`);
  }
  return originalSetSynthType.call(this, synthType);
};

const originalGetGameState = ChessGame.prototype.getGameState;
ChessGame.prototype.getGameState = function patched(this: ChessGame) {
  const state = originalGetGameState.call(this);
  (window as unknown as { __fen: string }).__fen = state.fen;
  return state;
};

type ProbeWindow = { __matchId: string; __guestName: string; __mount: () => void };
const probeWindow = window as unknown as ProbeWindow;

const originalTrigger = SoundGenerator.prototype.triggerSquareNote;
SoundGenerator.prototype.triggerSquareNote = function patched(this: SoundGenerator, square: string) {
  ensureOutputMeter();
  log(`SYNTH_NOTE square=${square} synthType=${this.getSynthType()}`);
  return originalTrigger.call(this, square);
};

const originalOwn = DualSynthGenerator.prototype.triggerOwnSquareNote;
DualSynthGenerator.prototype.triggerOwnSquareNote = function patched(this: DualSynthGenerator, square: string) {
  log(`>>> AUDIO own-synth square=${square}`);
  return originalOwn.call(this, square);
};

const originalOpponent = DualSynthGenerator.prototype.triggerOpponentSquareNote;
DualSynthGenerator.prototype.triggerOpponentSquareNote = function patched(this: DualSynthGenerator, square: string) {
  log(`>>> AUDIO opponent-synth square=${square}`);
  return originalOpponent.call(this, square);
};

const originalDispose = DualSynthGenerator.prototype.dispose;
DualSynthGenerator.prototype.dispose = function patched(this: DualSynthGenerator) {
  log('!!! DUAL_SYNTH_DISPOSED (all ringing notes killed)');
  return originalDispose.call(this);
};

probeWindow.__mount = () => {
  setGuestName(probeWindow.__guestName);
  const container = document.createElement('div');
  document.body.appendChild(container);
  createRoot(container).render(
    <TooltipProvider>
      <MatchPage />
    </TooltipProvider>
  );
};
