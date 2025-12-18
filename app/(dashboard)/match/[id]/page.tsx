'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { Board } from '@/components/chess/Board';
import { ChatRoom } from '@/components/chat/ChatRoom';
import { ChessGame } from '@/lib/chess/game';
import { useRealtimeMatch } from '@/hooks/useRealtimeMatch';
import { useDualAudioEngine } from '@/hooks/useDualAudioEngine';
import { getGuestName } from '@/lib/guestSession';
import { generateRoomCode } from '@/lib/roomCode';
import type { Match, MoveRecord } from '@/types/match';
import type { Square } from '@/types/chess';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Copy, Check } from 'lucide-react';

export default function MatchPage() {
  const params = useParams();
  const router = useRouter();
  const matchId = params.id as string;
  const [userName, setUserName] = useState<string | null>(null); // Guest name
  const [game, setGame] = useState<ChessGame | null>(null);
  const [playerColor, setPlayerColor] = useState<'w' | 'b' | null>(null);
  const [ownSynthType, setOwnSynthType] = useState<string | null>(null);
  const [opponentSynthType, setOpponentSynthType] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [whitePlayerName, setWhitePlayerName] = useState<string | null>(null);
  const [blackPlayerName, setBlackPlayerName] = useState<string | null>(null);
  const [roomEndedMessage, setRoomEndedMessage] = useState<string | null>(null);
  const [roomCodeCopied, setRoomCodeCopied] = useState(false);
  const [showAudioPrompt, setShowAudioPrompt] = useState(false);
  const previousMatchStatusRef = useRef<string | null>(null);
  const [gameStateKey, setGameStateKey] = useState(0); // Force re-render when game state changes
  const appliedMovesRef = useRef<Set<number>>(new Set()); // Track which moves have been applied
  const audioEngineRef = useRef<ReturnType<typeof useDualAudioEngine> | null>(null); // Reference to audio engine for use in callbacks
  const gameRef = useRef<ChessGame | null>(null); // Reference to game for use in callbacks
  const matchRef = useRef<Match | null>(null); // Reference to match for use in callbacks
  const userNameRef = useRef<string | null>(null); // Reference to userName (guest name) for use in callbacks
  const setGameStateKeyRef = useRef(setGameStateKey); // Ref to setGameStateKey for use in callbacks
  const lastAppliedMoveTimeRef = useRef<number>(0); // Track when we last applied a move to prevent FEN overwrite
  const isApplyingMoveRef = useRef<boolean>(false); // Flag to prevent FEN sync during move application
  const isInitializingRef = useRef<boolean>(false); // Flag to prevent FEN sync during initialization

  // Update refs when state changes
  useEffect(() => {
    setGameStateKeyRef.current = setGameStateKey;
  }, []);

  // Create stable callback refs
  const onMoveRef = useRef<((move: MoveRecord) => void) | undefined>(undefined);
  const onMatchUpdateRef = useRef<((match: Match) => void) | undefined>(undefined);

  // Update callback refs
  useEffect(() => {
    onMoveRef.current = (move: MoveRecord) => {
      console.log('onMove callback triggered:', move);
      const currentGame = gameRef.current;
      const currentUserName = userNameRef.current;
      const currentMatch = matchRef.current;

      if (!currentGame) {
        console.log('Skipping move: game not ready', { game: !!currentGame });
        return;
      }

      // Skip if this move was made by the current user (already applied locally)
      // Check by player_name
      const isOwnMove = move.player_name && move.player_name === currentUserName;
      if (isOwnMove) {
        console.log('Skipping move: made by current user');
        return;
      }

      // Skip if we've already applied this move
      if (appliedMovesRef.current.has(move.move_number)) {
        console.log('Skipping move: already applied', move.move_number);
        return;
      }

      // Update applied moves count
      appliedMovesRef.current.add(move.move_number);

      console.log('Applying opponent move:', move, {
        currentFen: currentGame.getFen(),
        moveNumber: move.move_number,
        playerId: move.player_id,
      });

      // Set flag to prevent FEN sync during move application
      isApplyingMoveRef.current = true;
      lastAppliedMoveTimeRef.current = Date.now();

      // Get game state before move to check for captures
      const gameStateBefore = currentGame.getGameState();
      const pieceBefore = currentGame.getPiece(move.move_to as Square);

      // Validate that the move is legal before applying
      const legalMoves = currentGame.getAllLegalMoves();
      const isValidMove = legalMoves.some(m => m.from === move.move_from && m.to === move.move_to);

      if (!isValidMove) {
        console.warn('Opponent move is not legal!', {
          from: move.move_from,
          to: move.move_to,
          currentFen: gameStateBefore.fen,
          legalMoves: legalMoves.length,
        });

        // Try to sync from FEN instead
        if (currentMatch?.current_fen) {
          console.log('Attempting to sync from match FEN:', currentMatch.current_fen);
          currentGame.loadFen(currentMatch.current_fen);
          setGameStateKeyRef.current(prev => prev + 1);
          isApplyingMoveRef.current = false;
          return;
        }
      }

      // Temporarily disable the game's onMove callback to prevent triggering own synth
      // We'll trigger opponent synth manually instead
      const originalCallback = currentGame.getOnMoveCallback();
      currentGame.setOnMove(null);

      // Apply the move to the game
      const success = currentGame.makeMove(move.move_from as Square, move.move_to as Square);

      // Restore the callback immediately after the move
      if (originalCallback) {
        currentGame.setOnMove(originalCallback);
      }

      if (success) {
        console.log('Move applied successfully');
        appliedMovesRef.current.add(move.move_number);
        // Force re-render by updating key
        setGameStateKeyRef.current(prev => prev + 1);

        // Get the FEN after the move to verify it matches
        const gameStateAfter = currentGame.getGameState();
        console.log('Game FEN after move:', gameStateAfter.fen);

        // Check if a piece was captured
        const wasCapture = !!pieceBefore;
        let capturedRow: number | undefined;
        if (wasCapture) {
          // Extract row from the destination square
          capturedRow = parseInt(move.move_to[1]);
        }

            // Trigger audio for opponent's move (opponent synth)
            if (audioEngineRef.current?.isReady) {
              console.log('Triggering audio for opponent move to:', move.move_to, 'captured:', wasCapture);
              audioEngineRef.current.triggerOpponentSquareNote(move.move_to as Square);
              if (wasCapture && capturedRow) {
                console.log('Triggering capture audio for row:', capturedRow);
                audioEngineRef.current.triggerOpponentRowCapture(capturedRow);
              }
            } else {
              console.log('Audio not ready, skipping audio trigger', {
                hasAudioEngine: !!audioEngineRef.current,
                isReady: audioEngineRef.current?.isReady,
              });
            }

        // Clear the flag after a short delay to allow FEN sync if needed
        setTimeout(() => {
          isApplyingMoveRef.current = false;
        }, 500);
      } else {
        console.log('Move failed, trying FEN fallback');
        isApplyingMoveRef.current = false;
        // If move failed, try loading from FEN as fallback
        if (currentMatch?.current_fen) {
          currentGame.loadFen(currentMatch.current_fen);
          setGameStateKeyRef.current(prev => prev + 1);
        }
      }
    };

    onMatchUpdateRef.current = (updatedMatch: Match) => {
      console.log('Match updated:', updatedMatch);

      // Update opponent synth type if it changed (e.g., when opponent joins)
      // This is important for the host who initialized before opponent joined
      const currentUserName = userNameRef.current;
      let currentPlayerColor: 'w' | 'b' | null = null;

      if (currentUserName) {
        currentPlayerColor = updatedMatch.white_player_name === currentUserName ? 'w' : updatedMatch.black_player_name === currentUserName ? 'b' : null;
        // Update playerColor state to ensure it stays in sync
        if (currentPlayerColor !== null) {
          setPlayerColor(currentPlayerColor);
        }
      }

      // Update opponent synth type when opponent joins or changes their synth
      // This is critical for the host who initialized before opponent joined
      if (currentPlayerColor === 'w') {
        // We're white, opponent is black
        if (updatedMatch.black_player_synth_type) {
          console.log('Updating opponent synth type (black):', updatedMatch.black_player_synth_type, 'current:', opponentSynthType);
          setOpponentSynthType(updatedMatch.black_player_synth_type);
        }
      } else if (currentPlayerColor === 'b') {
        // We're black, opponent is white
        if (updatedMatch.white_player_synth_type) {
          console.log('Updating opponent synth type (white):', updatedMatch.white_player_synth_type, 'current:', opponentSynthType);
          setOpponentSynthType(updatedMatch.white_player_synth_type);
        }
      }

      // Update player names when match updates (e.g., when opponent joins)
      // This ensures the creator sees the opponent's name when they join
      if (updatedMatch.white_player_name) {
        setWhitePlayerName(updatedMatch.white_player_name);
      }
      if (updatedMatch.black_player_name) {
        setBlackPlayerName(updatedMatch.black_player_name);
      }

      // Check if room was ended by creator
      const previousStatus = previousMatchStatusRef.current;
      if (previousStatus && previousStatus !== 'finished' && updatedMatch.status === 'finished') {
        // Room was just ended - check if it was ended by creator (not checkmate/stalemate)
        const currentGame = gameRef.current;
        const gameState = currentGame?.getGameState();
        if (!gameState?.isCheckmate && !gameState?.isStalemate && !gameState?.isDraw) {
          // Room was manually ended by creator
          // Get creator name (white player is always the creator)
          let creatorName = 'the host';
          if (updatedMatch.white_player_name) {
            creatorName = updatedMatch.white_player_name;
          }
          setRoomEndedMessage(`${creatorName} ended the room.`);
        }
      }
      previousMatchStatusRef.current = updatedMatch.status;

      // When match FEN updates, sync the game - match FEN is always the source of truth
      const currentGame = gameRef.current;
      if (currentGame && updatedMatch.current_fen) {
        const currentFen = currentGame.getFen();

        // Don't sync if we're initializing
        if (isInitializingRef.current) {
          console.log('Skipping FEN sync - game is initializing');
          return;
        }

        // Always sync if FENs don't match - match FEN is the source of truth
        if (currentFen !== updatedMatch.current_fen) {
          // If we just applied a move locally, give it a moment to propagate to the database
          // But don't wait too long - if match FEN is different, it's the truth
          const timeSinceLastMove = Date.now() - lastAppliedMoveTimeRef.current;
          if (isApplyingMoveRef.current && timeSinceLastMove < 300) {
            console.log('Move just applied, waiting briefly before syncing', {
              timeSinceLastMove,
            });
            // Check again after a short delay
            setTimeout(() => {
              const stillCurrentFen = gameRef.current?.getFen();
              if (stillCurrentFen !== updatedMatch.current_fen && gameRef.current) {
                console.log('Syncing from match FEN after move propagation delay:', updatedMatch.current_fen);
                gameRef.current.loadFen(updatedMatch.current_fen);
                setGameStateKeyRef.current(prev => prev + 1);
              }
            }, 500);
            return;
          }

          console.log('FEN mismatch - syncing from match FEN (source of truth)', {
            currentFen,
            matchFen: updatedMatch.current_fen,
            timeSinceLastMove,
            isApplying: isApplyingMoveRef.current,
          });
          currentGame.loadFen(updatedMatch.current_fen);
          setGameStateKeyRef.current(prev => prev + 1);
        } else {
          console.log('FEN already in sync');
        }
      }
    };
  }, [opponentSynthType]); // Include opponentSynthType to update audio when it changes

  const {
    match,
    moves,
    chatMessages,
    loading,
    error: realtimeError,
    sendMessage,
  } = useRealtimeMatch({
    matchId,
    onMove: (move: MoveRecord) => {
      onMoveRef.current?.(move);
    },
    onMatchUpdate: (updatedMatch: Match) => {
      onMatchUpdateRef.current?.(updatedMatch);
    },
  });

  // Initialize user and game
  useEffect(() => {
    const init = async () => {
      // Get guest name from sessionStorage
      const guestName = getGuestName();
      let currentUserName: string | null = null;

      if (guestName) {
        currentUserName = guestName;
        setUserName(guestName);
        userNameRef.current = guestName;
      } else {
        // If no guest name, redirect to home
        router.replace('/');
        return;
      }

      if (match && !game) {
        // Set flag to prevent FEN sync during initialization
        isInitializingRef.current = true;
        console.log('Initializing game from match:', {
          matchId: match.id,
          currentFen: match.current_fen,
          movesCount: moves.length,
        });

        matchRef.current = match;

        // Determine player color and if user is creator
        let color: 'w' | 'b' | null = null;
        if (currentUserName) {
          if (match.white_player_name === currentUserName) {
            color = 'w';
            setIsCreator(true); // Creator is white player
          } else if (match.black_player_name === currentUserName) {
            color = 'b';
            setIsCreator(false);
          } else {
            // Player name not found in match - this shouldn't happen, but log it
            console.warn('Player name not found in match:', {
              currentUserName,
              whitePlayerName: match.white_player_name,
              blackPlayerName: match.black_player_name,
            });
            color = null;
          }
        }
        setPlayerColor(color);
        console.log('Set player color:', { color, currentUserName, whitePlayerName: match.white_player_name, blackPlayerName: match.black_player_name });

        // Set synth types - own and opponent
        if (color === 'w') {
          setOwnSynthType(match.white_player_synth_type);
          // If opponent hasn't joined yet, black_player_synth_type might be default
          // It will be updated when opponent joins via onMatchUpdateRef
          setOpponentSynthType(match.black_player_synth_type || 'Synth');
        } else if (color === 'b') {
          setOwnSynthType(match.black_player_synth_type);
          setOpponentSynthType(match.white_player_synth_type);
        }

        // Set player names for display
        setWhitePlayerName(match.white_player_name || null);
        setBlackPlayerName(match.black_player_name || null);

        // Initialize game from match FEN
        const chessGame = new ChessGame(match.current_fen);
        gameRef.current = chessGame;
        setGame(chessGame);

        // Store initial match status
        previousMatchStatusRef.current = match.status;

        // Track which moves we've seen (for duplicate detection in real-time)
        // Don't replay moves - match FEN is the source of truth, already loaded above
        if (moves.length > 0) {
          console.log('Tracking existing moves for duplicate detection:', moves.length);
          moves.forEach((move) => {
            appliedMovesRef.current.add(move.move_number);
          });
        }

        console.log('Game initialized from match FEN (source of truth):', match.current_fen);
        setGameStateKey(prev => prev + 1);

        // Clear initialization flag after a short delay
        setTimeout(() => {
          isInitializingRef.current = false;
          console.log('Initialization complete');
        }, 1000);
      }
    };
    init();
  }, [match, router, moves, game]);

  // Dual audio engine - must be declared before useEffect that uses it
  const audioEngine = useDualAudioEngine(
    ownSynthType as 'Synth' | 'AMSynth' | 'FMSynth' | 'MembraneSynth' | null,
    opponentSynthType as 'Synth' | 'AMSynth' | 'FMSynth' | 'MembraneSynth' | null
  );

  // Store references for use in callbacks
  useEffect(() => {
    audioEngineRef.current = audioEngine;
    gameRef.current = game;
    matchRef.current = match;
  }, [audioEngine, game, match]);

  // Show audio prompt dialog when match is ready and audio is not initialized
  useEffect(() => {
    if (match && game && playerColor && !audioEngine.isInitialized && !showAudioPrompt) {
      // Small delay to ensure the page is fully rendered
      const timer = setTimeout(() => {
        setShowAudioPrompt(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [match, game, playerColor, audioEngine.isInitialized, showAudioPrompt]);

  // Set up audio triggers when game and audio engine are ready
  // This handles audio for local moves (own synth) only
  useEffect(() => {
    if (game && audioEngine.isReady) {
      const audioCallback = (move: { from: Square; to: Square; promotion?: string; captured?: string }, captured: boolean, capturedRow?: number) => {
        console.log('Game onMove callback triggered (local):', move.to, 'captured:', captured);
        // Only trigger own synth for local moves (moves made by this player)
        // Opponent moves are handled separately in the onMoveRef callback
        audioEngine.triggerOwnSquareNote(move.to);
        if (captured && capturedRow) {
          console.log('Triggering capture audio for row:', capturedRow);
          audioEngine.triggerOwnRowCapture(capturedRow);
        }
      };
      game.setOnMove(audioCallback);
      console.log('Audio callback set up on game for local moves (own synth)');
    }
  }, [game, audioEngine]);

  const handleEnableAudio = async () => {
    await audioEngine.initializeAudio();
    setShowAudioPrompt(false); // Close the dialog when audio is enabled
  };

  const handleMove = async (from: Square, to: Square) => {
    if (!game || !match || !userName) return; // Must have userName

    // Don't allow moves if match is not active
    if (match.status !== 'active') {
      console.warn('Match is not active. Status:', match.status);
      return;
    }

    // Check if it's the player's turn - get fresh game state
    const currentGameState = game.getGameState();
    console.log('handleMove - Checking turn:', {
      currentTurn: currentGameState.turn,
      playerColor,
      match: currentGameState.turn === playerColor,
    });

    if (currentGameState.turn !== playerColor) {
      console.warn('Not your turn', {
        currentTurn: currentGameState.turn,
        playerColor,
        fen: currentGameState.fen,
      });
      return;
    }

    // Set flag to prevent FEN sync during move application
    isApplyingMoveRef.current = true;
    lastAppliedMoveTimeRef.current = Date.now();

    const success = game.makeMove(from, to);
    if (!success) {
      console.warn('Invalid move:', { from, to });
      isApplyingMoveRef.current = false;
      return;
    }

    // Get updated game state after the move
    const updatedGameState = game.getGameState();
    // Calculate move number from game state (history length), not from moves array
    // This ensures correct numbering even if moves array is out of sync
    const moveNumber = game.getMoveNumber();

    // Mark this move as applied locally
    appliedMovesRef.current.add(moveNumber);

    // Force re-render
    setGameStateKey(prev => prev + 1);

    // Clear the flag after move is saved to database
    // This allows FEN sync to work normally after our move propagates

    // Save move to database
    const moveData = {
      match_id: matchId,
      move_san: `${from}-${to}`, // Simplified SAN
      move_from: from,
      move_to: to,
      move_number: moveNumber,
      player_name: userName,
    };

    const { error } = await supabase
      .from('moves')
      .insert(moveData);

    if (error) {
      console.error('Error saving move:', error);
      // Revert the move if save failed
      if (match?.current_fen) {
        game.loadFen(match.current_fen);
        appliedMovesRef.current.delete(moveNumber);
        setGameStateKey(prev => prev + 1);
      }
      return;
    }

    // Update match FEN
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        current_fen: updatedGameState.fen,
        status: updatedGameState.isCheckmate || updatedGameState.isStalemate || updatedGameState.isDraw ? 'finished' : 'active',
        winner_id: null, // No user IDs in guest-only mode
        finished_at: updatedGameState.isCheckmate || updatedGameState.isStalemate || updatedGameState.isDraw ? new Date().toISOString() : null,
      })
      .eq('id', matchId);

    if (updateError) {
      console.error('Error updating match FEN:', updateError);
    }

    // Clear the flag after move is saved - allow FEN sync to work
    // Use a small delay to ensure the update has propagated
    setTimeout(() => {
      isApplyingMoveRef.current = false;
    }, 200);
  };

  // Helper functions for restart and end room
  const handleRestartGame = async () => {
    if (!match || !isCreator) return;

    const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    // Reset game state
    if (game) {
      game.loadFen(initialFen);
      setGameStateKey(prev => prev + 1);
    }

    // Update match
    await supabase
      .from('matches')
      .update({
        current_fen: initialFen,
        status: 'active',
        winner_id: null,
        finished_at: null,
      })
      .eq('id', matchId);

    // Clear moves (optional - you might want to keep move history)
    appliedMovesRef.current.clear();
  };

  const handleEndRoom = async () => {
    if (!match || !isCreator) return;

    await supabase
      .from('matches')
      .update({
        status: 'finished',
      })
      .eq('id', matchId);

    router.push('/');
  };

  if (loading || !match || !game || !playerColor) {
    return (
      <div className="min-h-screen bg-[#212529] text-white flex items-center justify-center">
        <div>Loading match...</div>
      </div>
    );
  }

  // Get fresh game state on every render
  const gameState = game.getGameState();
  // Ensure playerColor is set before comparing
  const isMyTurn = playerColor !== null && gameState.turn === playerColor;

  // Debug logging
  console.log('Render - Game state:', {
    turn: gameState.turn,
    playerColor,
    isMyTurn,
    fen: gameState.fen,
    whitePlayerName: match?.white_player_name,
    blackPlayerName: match?.black_player_name,
    userName,
  });

  // Get display names
  const getPlayerDisplayName = (color: 'w' | 'b') => {
    if (color === 'w') {
      if (playerColor === 'w') {
        return userName || 'You';
      }
      return whitePlayerName || (match?.status === 'waiting' ? 'Opponent' : 'White Player');
    } else {
      if (playerColor === 'b') {
        return userName || 'You';
      }
      return blackPlayerName || (match?.status === 'waiting' ? 'Opponent' : 'Black Player');
    }
  };

  const roomCode = generateRoomCode(matchId);

  const handleCopyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setRoomCodeCopied(true);
    setTimeout(() => setRoomCodeCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
          </div>
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className="text-base text-muted-foreground">Room Code:</span>
              <Badge variant="outline" className="font-mono text-base px-3 py-1.5">{roomCode}</Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    onClick={handleCopyRoomCode}
                  >
                    {roomCodeCopied ? (
                      <Check className="h-5 w-5 text-green-500" />
                    ) : (
                      <Copy className="h-5 w-5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{roomCodeCopied ? 'Copied!' : 'Copy room code'}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Button variant="ghost" asChild className="text-base">
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </header>

        {/* Player Names and Room Name */}
        <div className="text-center mb-6">
          <h2 className="text-4xl font-bold mb-2">
            {getPlayerDisplayName('w')} vs {getPlayerDisplayName('b')}
          </h2>
          {match.room_name && (
            <p className="text-lg text-muted-foreground">{match.room_name}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
          {/* Main board area - 70% width */}
          <div className="lg:col-span-7 space-y-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
            {gameState.isCheckmate && (
              <Alert>
                <AlertTitle>Checkmate!</AlertTitle>
                <AlertDescription>
                  {gameState.turn === 'w' ? 'Black' : 'White'} wins!
                </AlertDescription>
              </Alert>
            )}

            {gameState.isStalemate && (
              <Alert>
                <AlertTitle>Stalemate!</AlertTitle>
                <AlertDescription>The game is a draw.</AlertDescription>
              </Alert>
            )}

            {match.status === 'waiting' && (
              <Alert>
                <AlertDescription>Waiting for opponent to join...</AlertDescription>
              </Alert>
            )}

            {match.status === 'active' && !gameState.isCheckmate && !gameState.isStalemate && (
              <Alert>
                <AlertDescription>
                  {isMyTurn ? 'Your turn' : "Opponent's turn"} - {gameState.turn === 'w' ? 'White' : 'Black'} to move
                </AlertDescription>
              </Alert>
            )}

            {roomEndedMessage && (
              <Alert variant="destructive">
                <AlertTitle>⚠️ Room Ended</AlertTitle>
                <AlertDescription className="mb-4">{roomEndedMessage}</AlertDescription>
                <Button onClick={() => router.push('/')} variant="outline" size="sm">
                  Return to Home
                </Button>
              </Alert>
            )}

            {realtimeError && (
              <Alert variant="destructive">
                <AlertTitle>⚠️ Realtime Connection Error</AlertTitle>
                <AlertDescription className="mb-2">{realtimeError}</AlertDescription>
                <details className="text-xs">
                  <summary className="cursor-pointer hover:underline">How to fix</summary>
                  <ol className="list-decimal list-inside mt-2 space-y-1">
                    <li>Go to your Supabase dashboard</li>
                    <li>Navigate to SQL Editor</li>
                    <li>Run the SQL from <code className="bg-destructive/20 px-1 rounded">supabase/enable_realtime.sql</code></li>
                    <li>Or enable replication in Database → Replication for: matches, moves, chat_messages</li>
                    <li>Refresh this page</li>
                  </ol>
                </details>
              </Alert>
            )}


            {/* Audio prompt dialog - shows when player joins */}
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



            <div key={gameStateKey}>
              <Board
                game={game}
                playerColor={playerColor}
                onMove={handleMove}
                orientation={playerColor}
              />
            </div>

            {/* Creator Controls */}
            {isCreator && (
              <div className="flex gap-4 mt-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="border-[0.5px] w-full">
                      Restart Game
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Restart Game?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will reset the game to the starting position. All moves will be cleared. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRestartGame}>
                        Restart Game
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="border-[0.5px] w-full">
                      End Room
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>End Room?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will end the room and notify all players. The game will be marked as finished. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleEndRoom}>
                        End Room
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar with chat - 30% width */}
          <div className="lg:col-span-3">
            <div className="h-[600px]">
              <ChatRoom
                messages={chatMessages}
                onSendMessage={(msg) => sendMessage(msg, userName)}
                currentUserName={userName || undefined}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
