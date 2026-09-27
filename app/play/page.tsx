'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Board } from '@/components/chess/Board';
import { ChessGame } from '@/lib/chess/game';
import { useAudioEngine } from '@/hooks/useAudioEngine';
import { SynthSelector } from '@/components/audio/SynthSelector';
import { AudioTransport } from '@/components/audio/AudioTransport';
import type { SynthType } from '@/types/audio';
import type { Square } from '@/types/chess';
import Link from 'next/link';
import { Volume2 } from 'lucide-react';
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

function PlayPageContent() {
  const searchParams = useSearchParams();
  const synthFromUrl = searchParams?.get('synth') as SynthType | null;

  const [game] = useState(() => new ChessGame());
  const [synthType, setSynthType] = useState<SynthType>(synthFromUrl || 'Synth');
  const [gameState, setGameState] = useState(() => game.getGameState());
  const [showAudioPrompt, setShowAudioPrompt] = useState(false);
  const audioPromptDismissedRef = useRef(false);
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

  // Offer the dialog once. Dismissing it (including Escape) must not start
  // audio; the header button stays available until the context is running.
  useEffect(() => {
    if (audioEngine.isInitialized || audioPromptDismissedRef.current) return;
    const timer = setTimeout(() => {
      setShowAudioPrompt(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [audioEngine.isInitialized]);

  const handleAudioPromptOpenChange = (open: boolean) => {
    if (!open) {
      audioPromptDismissedRef.current = true;
    }
    setShowAudioPrompt(open);
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
    <div className="min-h-screen bg-background p-2 sm:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {!audioEngine.isInitialized && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleEnableAudio}
                aria-label="Enable audio"
              >
                <Volume2 />
                Enable audio
              </Button>
            )}
            <AudioTransport onStop={audioEngine.stopAll} />
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
            <CardContent className="px-0 sm:px-6 space-y-4">
              <div className="px-2 sm:px-0">
              <SynthSelector
                value={synthType}
                onChange={setSynthType}
                label="Synth Choice"
              />
              </div>

              {/* Audio prompt dialog - shows when player starts solo mode */}
              <AlertDialog open={showAudioPrompt} onOpenChange={handleAudioPromptOpenChange}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Enable Audio</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your browser only plays sound after a tap. Each move plays a note that rings for about 20 seconds.
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

              <div className="flex justify-center gap-4 px-2 sm:px-0">
                <Button onClick={handleReset} variant="outline">
                  Reset Game
                </Button>
              </div>

              {gameState.isCheckmate && (
                <Alert className="mx-2 sm:mx-0">
                  <AlertDescription className="text-center text-lg font-semibold">
                    Checkmate! {gameState.turn === 'w' ? 'Black' : 'White'} wins!
                  </AlertDescription>
                </Alert>
              )}

              {gameState.isStalemate && (
                <Alert className="mx-2 sm:mx-0">
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

export default function PlayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-foreground">Loading...</div>
      </div>
    }>
      <PlayPageContent />
    </Suspense>
  );
}
