'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Board } from '@/components/chess/Board';
import { ChessGame } from '@/lib/chess/game';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { SynthSelector } from '@/components/audio/SynthSelector';
import type { SynthType } from '@/types/audio';
import type { Square } from '@/types/chess';
import Link from 'next/link';

export default function PlayPage() {
  const searchParams = useSearchParams();
  const synthFromUrl = searchParams?.get('synth') as SynthType | null;

  const [game] = useState(() => new ChessGame());
  const [synthType, setSynthType] = useState<SynthType>(synthFromUrl || 'Synth');
  const [gameState, setGameState] = useState(() => game.getGameState());
  const audioEngine = useAudioEngine(synthType, 'w'); // Always use 'w' for audio, doesn't matter in solo play

  // Set up audio triggers when audio engine is ready
  useEffect(() => {
    if (audioEngine.isReady) {
      game.setOnMove((move, captured, capturedRow) => {
        audioEngine.triggerSquareNote(move.to);
        if (captured && capturedRow) {
          audioEngine.triggerRowCapture(capturedRow);
        }
      });
    }
  }, [game, audioEngine]);

  const handleEnableAudio = async () => {
    await audioEngine.initializeAudio();
  };

  const handleMove = (from: Square, to: Square) => {
    // For solo play, allow moves for whichever side's turn it is
    const success = game.makeMove(from, to);
    if (success) {
      // Update game state to trigger re-render and switch turns
      const newState = game.getGameState();
      setGameState(newState);
    }
  };

  const handleReset = () => {
    game.reset();
    setGameState(game.getGameState());
  };

  // For solo play, always allow moves for current turn (pass null as playerColor)
  const currentTurn = gameState.turn;

  return (
    <div className="min-h-screen bg-[#212529] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <span className="text-3xl">♞</span>
            <h1 className="text-2xl font-bold">64 Squares</h1>
          </div>
          <Link
            href="/"
            className="px-4 py-2 text-[#ADB5BD] hover:text-white font-medium transition-colors"
          >
            Back to Home
          </Link>
        </header>

        <div className="max-w-4xl mx-auto">
          <div className="bg-[#343A40] rounded-lg p-8 space-y-6">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-2">Solo Play</h2>
              <p className="text-[#ADB5BD]">Play against yourself</p>
            </div>

            <div className="space-y-4">
              <SynthSelector
                value={synthType}
                onChange={setSynthType}
                label="Synth Choice"
              />

              {!audioEngine.isInitialized && (
                <div className="p-4 bg-[#495057] border border-[#6C757D] rounded-lg">
                  <p className="text-[#ADB5BD] mb-3 text-sm">
                    <strong>Audio disabled:</strong> Click below to enable sound.
                  </p>
                  <button
                    onClick={handleEnableAudio}
                    className="px-4 py-2 bg-[#495057] hover:bg-[#6C757D] text-white rounded-md text-sm font-semibold transition-colors"
                  >
                    🎵 Enable Audio
                  </button>
                </div>
              )}

              <div className="flex justify-center">
                <Board
                  game={game}
                  playerColor={null}
                  onMove={handleMove}
                  orientation="w"
                />
              </div>

              <div className="flex justify-center gap-4">
                <button
                  onClick={handleReset}
                  className="px-6 py-2 bg-[#495057] hover:bg-[#6C757D] rounded-lg font-medium transition-colors"
                >
                  Reset Game
                </button>
              </div>

              {gameState.isCheckmate && (
                <div className="p-3 bg-[#495057] border border-[#6C757D] rounded text-center">
                  <p className="text-lg font-semibold">
                    Checkmate! {gameState.turn === 'w' ? 'Black' : 'White'} wins!
                  </p>
                </div>
              )}

              {gameState.isStalemate && (
                <div className="p-3 bg-[#495057] border border-[#6C757D] rounded text-center">
                  <p className="text-lg font-semibold">Stalemate! The game is a draw.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
