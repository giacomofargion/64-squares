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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function PlayPage() {
  const searchParams = useSearchParams();
  const synthFromUrl = searchParams?.get('synth') as SynthType | null;

  const [game] = useState(() => new ChessGame());
  const [synthType, setSynthType] = useState<SynthType>(synthFromUrl || 'Synth');
  const [gameState, setGameState] = useState(() => game.getGameState());
  const [showAudioPrompt, setShowAudioPrompt] = useState(false);
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
    setShowAudioPrompt(false); // Close the dialog when audio is enabled
  };

  // Show audio prompt dialog when page loads and audio is not initialized
  useEffect(() => {
    if (!audioEngine.isInitialized && !showAudioPrompt) {
      // Small delay to ensure the page is fully rendered
      const timer = setTimeout(() => {
        setShowAudioPrompt(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [audioEngine.isInitialized, showAudioPrompt]);

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
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
          </div>
          <Button variant="ghost" asChild className="text-base">
              <Link href="/">Back to Home</Link>
            </Button>
        </header>

        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-center text-2xl">Solo Play</CardTitle>
              {/* <CardDescription className="text-center text-base">Play against yourself</CardDescription> */}
            </CardHeader>
            <CardContent className="space-y-4">
              <SynthSelector
                value={synthType}
                onChange={setSynthType}
                label="Synth Choice"
              />

              {/* Audio prompt dialog - shows when player starts solo mode */}
              <AlertDialog open={showAudioPrompt} onOpenChange={setShowAudioPrompt}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Enable Audio</AlertDialogTitle>
                    <AlertDialogDescription>
                      Please enable audio.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogAction onClick={handleEnableAudio} className="border-2 border-input">
                      Enable Audio
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <div className="flex justify-center">
                <Board
                  game={game}
                  playerColor={null}
                  onMove={handleMove}
                  orientation="w"
                />
              </div>

              <div className="flex justify-center gap-4">
                <Button onClick={handleReset} variant="outline">
                  Reset Game
                </Button>
              </div>

              {gameState.isCheckmate && (
                <Alert>
                  <AlertDescription className="text-center text-lg font-semibold">
                    Checkmate! {gameState.turn === 'w' ? 'Black' : 'White'} wins!
                  </AlertDescription>
                </Alert>
              )}

              {gameState.isStalemate && (
                <Alert>
                  <AlertDescription className="text-center text-lg font-semibold">
                    Stalemate! The game is a draw.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
