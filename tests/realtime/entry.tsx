import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '@/components/ui/tooltip';
import MatchPage from '@/app/(dashboard)/match/[id]/page';
import { SoundGenerator } from '@/components/audio/SoundGenerator';
import { DualSynthGenerator } from '@/components/audio/DualSynthGenerator';
import { setGuestName } from '@/lib/guestSession';
import { ChessGame } from '@/lib/chess/game';
import { log } from './probe-log';

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
