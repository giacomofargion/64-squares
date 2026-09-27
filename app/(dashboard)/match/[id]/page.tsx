'use client';

import { useCallback, useEffect, useState, useRef, useSyncExternalStore } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { Board } from '@/components/chess/Board';
import { ChatRoom } from '@/components/chat/ChatRoom';
import { ChessGame, INITIAL_FEN, findConnectingMove } from '@/lib/chess/game';
import { useRealtimeMatch } from '@/hooks/useRealtimeMatch';
import { useDualAudioEngine } from '@/hooks/useDualAudioEngine';
import { AudioTransport } from '@/components/audio/AudioTransport';
import { getGuestName } from '@/lib/guestSession';
import { generateRoomCode } from '@/lib/roomCode';
import type { Match, MatchStatus, MoveRecord } from '@/types/match';
import type { Square } from '@/types/chess';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Copy, Check, Share2, Volume2 } from 'lucide-react';

type InviteCopyState = 'idle' | 'copied' | 'failed';

function subscribeToShareSupport() {
  return () => {};
}

function readShareSupport() {
  return typeof navigator.share === 'function';
}

function readServerShareSupport() {
  return false;
}

function boardStatus(
  status: MatchStatus,
  gameState: { isCheckmate: boolean; isStalemate: boolean; turn: 'w' | 'b' },
  isMyTurn: boolean,
): { badge: string; detail: string; variant: 'default' | 'secondary' } {
  if (gameState.isCheckmate) {
    return {
      badge: 'Checkmate',
      detail: `${gameState.turn === 'w' ? 'Black' : 'White'} wins!`,
      variant: 'default',
    };
  }
  if (gameState.isStalemate) {
    return {
      badge: 'Stalemate',
      detail: 'The game is a draw.',
      variant: 'secondary',
    };
  }

  switch (status) {
    case 'waiting':
      return {
        badge: 'Waiting',
        detail: 'Waiting for opponent to join...',
        variant: 'secondary',
      };
    case 'active':
      return {
        badge: isMyTurn ? 'Your turn' : "Opponent's turn",
        detail: `${gameState.turn === 'w' ? 'White' : 'Black'} to move`,
        variant: isMyTurn ? 'default' : 'secondary',
      };
    case 'finished':
      return {
        badge: 'Game over',
        detail: 'This game has ended.',
        variant: 'secondary',
      };
    default: {
      const exhaustive: never = status;
      return { badge: 'Game over', detail: exhaustive, variant: 'secondary' };
    }
  }
}

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
  const [opponentJoinedMessage, setOpponentJoinedMessage] = useState<string | null>(null);
  const [inviteCopyState, setInviteCopyState] = useState<InviteCopyState>('idle');
  const canShareInvite = useSyncExternalStore(
    subscribeToShareSupport,
    readShareSupport,
    readServerShareSupport,
  );
  const [showAudioPrompt, setShowAudioPrompt] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const audioPromptDismissedRef = useRef(false);
  const previousMatchStatusRef = useRef<string | null>(null);
  const previousWhitePlayerNameRef = useRef<string | null>(null);
  const previousBlackPlayerNameRef = useRef<string | null>(null);
  const [gameStateKey, setGameStateKey] = useState(0); // Force re-render when game state changes
  const audioEngineRef = useRef<ReturnType<typeof useDualAudioEngine> | null>(null); // Reference to audio engine for use in callbacks
  const gameRef = useRef<ChessGame | null>(null); // Reference to game for use in callbacks
  const matchRef = useRef<Match | null>(null); // Reference to match for use in callbacks
  const userNameRef = useRef<string | null>(null); // Reference to userName (guest name) for use in callbacks
  const lastAppliedMoveTimeRef = useRef<number>(0); // Track when we last applied a move to prevent FEN overwrite
  const isApplyingMoveRef = useRef<boolean>(false); // Flag to prevent FEN sync during move application
  const isInitializingRef = useRef<boolean>(false); // Flag to prevent FEN sync during initialization

  // Every position that comes from the other player goes through here, whether it
  // arrived as a move record or as a match FEN update. Whichever message lands first
  // advances the board and plays the note; the other one finds the position already
  // on the board and does nothing. That way a dropped move record only changes which
  // message plays the note instead of losing the sound altogether.
  const advanceToRemotePosition = useCallback((nextFen: string) => {
    const currentGame = gameRef.current;
    if (!currentGame || currentGame.getFen() === nextFen) return;

    const playedMove = findConnectingMove(currentGame.getFen(), nextFen);

    if (!currentGame.loadFen(nextFen)) {
      console.warn('Ignoring unusable FEN from realtime update:', nextFen);
      return;
    }
    setGameStateKey(prev => prev + 1);

    if (!playedMove) {
      setLastMove(null);
      return;
    }

    const audioEngine = audioEngineRef.current;
    if (!audioEngine?.isReady) {
      console.log('Audio not ready, skipping note for opponent move to', playedMove.to);
      setLastMove({ from: playedMove.from, to: playedMove.to });
      return;
    }

    audioEngine.triggerOpponentSquareNote(playedMove.to);
    if (playedMove.captured) {
      audioEngine.triggerOpponentRowCapture(parseInt(playedMove.to[1], 10));
    }
    setLastMove({ from: playedMove.from, to: playedMove.to });
  }, []);

  // Create stable callback refs
  const onMoveRef = useRef<((move: MoveRecord) => void) | undefined>(undefined);
  const onMatchUpdateRef = useRef<((match: Match) => void) | undefined>(undefined);

  // Update callback refs
  useEffect(() => {
    onMoveRef.current = (move: MoveRecord) => {
      const currentGame = gameRef.current;
      const currentMatch = matchRef.current;

      if (!currentGame) {
        console.log('Skipping move: game not ready');
        return;
      }

      // Our own moves are played on the board and heard the moment we make them.
      if (move.player_name && move.player_name === userNameRef.current) {
        return;
      }

      // The move record only says which squares changed, so work out the position it
      // leads to. If it does not fit our board we are out of step with the database
      // and the match FEN is the authority.
      const nextFen =
        currentGame.fenAfterMove(move.move_from as Square, move.move_to as Square) ??
        currentMatch?.current_fen;

      if (!nextFen) {
        console.warn('Opponent move does not fit the board and no match FEN to fall back on:', move);
        return;
      }

      isApplyingMoveRef.current = true;
      lastAppliedMoveTimeRef.current = Date.now();

      advanceToRemotePosition(nextFen);

      // Let the FEN sync take over again once our own update has had time to land.
      setTimeout(() => {
        isApplyingMoveRef.current = false;
      }, 500);
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
          console.log('Updating opponent synth type (black):', updatedMatch.black_player_synth_type);
          setOpponentSynthType(updatedMatch.black_player_synth_type);
        }
      } else if (currentPlayerColor === 'b') {
        // We're black, opponent is white
        if (updatedMatch.white_player_synth_type) {
          console.log('Updating opponent synth type (white):', updatedMatch.white_player_synth_type);
          setOpponentSynthType(updatedMatch.white_player_synth_type);
        }
      }

      // Detect when opponent joins by checking if a player name appears that wasn't there before
      // Only show join message if match is active and opponent just joined (not finished)
      if (currentUserName && updatedMatch.status !== 'finished' && updatedMatch.status === 'active') {
        const isWhite = updatedMatch.white_player_name === currentUserName;
        const isBlack = updatedMatch.black_player_name === currentUserName;

        // Only show join message if opponent name just appeared (wasn't there before)
        // Check refs BEFORE updating them to detect the join event
        // This prevents false positives when moves are made (refs will already be set)
        if (isWhite && updatedMatch.black_player_name && !previousBlackPlayerNameRef.current) {
          // We're white, opponent (black) just joined
          setOpponentJoinedMessage(`${updatedMatch.black_player_name} has joined the room!`);
          // Auto-dismiss after 4 seconds
          setTimeout(() => setOpponentJoinedMessage(null), 4000);
        } else if (isBlack && updatedMatch.white_player_name && !previousWhitePlayerNameRef.current) {
          // We're black, opponent (white) just joined
          setOpponentJoinedMessage(`${updatedMatch.white_player_name} has joined the room!`);
          // Auto-dismiss after 4 seconds
          setTimeout(() => setOpponentJoinedMessage(null), 4000);
        }
      }

      // Update player names when match updates (e.g., when opponent joins)
      // This ensures the creator sees the opponent's name when they join
      if (updatedMatch.white_player_name) {
        setWhitePlayerName(updatedMatch.white_player_name);
        previousWhitePlayerNameRef.current = updatedMatch.white_player_name;
      }
      if (updatedMatch.black_player_name) {
        setBlackPlayerName(updatedMatch.black_player_name);
        previousBlackPlayerNameRef.current = updatedMatch.black_player_name;
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

        if (currentFen === updatedMatch.current_fen) {
          return;
        }

        // Check if this is a restart (FEN reset to initial position)
        const isRestart = updatedMatch.current_fen === INITIAL_FEN && currentFen !== INITIAL_FEN;

        // If we just applied a move locally, give it a moment to propagate to the database
        // But don't wait too long - if match FEN is different, it's the truth
        // Skip the delay if this is a restart (we want immediate sync)
        const timeSinceLastMove = Date.now() - lastAppliedMoveTimeRef.current;
        if (!isRestart && isApplyingMoveRef.current && timeSinceLastMove < 300) {
          setTimeout(() => advanceToRemotePosition(updatedMatch.current_fen), 500);
          return;
        }

        console.log('Syncing from match FEN (source of truth):', updatedMatch.current_fen);
        advanceToRemotePosition(updatedMatch.current_fen);
      }
    };
  }, [advanceToRemotePosition]);

  const {
    match,
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
            // Player name not found in match - redirect them away
            console.warn('Player name not found in match - redirecting:', {
              currentUserName,
              whitePlayerName: match.white_player_name,
              blackPlayerName: match.black_player_name,
            });
            // User is not one of the two players - redirect to home
            router.replace('/');
            return;
          }
        }

        // Additional safety check: ensure room has exactly 1 or 2 players
        const hasWhitePlayer = !!match.white_player_name;
        const hasBlackPlayer = !!match.black_player_name;
        const playerCount = (hasWhitePlayer ? 1 : 0) + (hasBlackPlayer ? 1 : 0);

        if (playerCount > 2) {
          console.error('Room has more than 2 players - invalid state');
          router.replace('/');
          return;
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
        // Initialize previous player name refs to track joins
        previousWhitePlayerNameRef.current = match.white_player_name || null;
        previousBlackPlayerNameRef.current = match.black_player_name || null;

        // Initialize game from match FEN
        const chessGame = new ChessGame(match.current_fen);
        gameRef.current = chessGame;
        setGame(chessGame);

        // Store initial match status
        previousMatchStatusRef.current = match.status;

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
  }, [match, router, game]);

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

  // Offer the dialog once. Dismissing it (including Escape) must not start
  // audio; the header button stays available until the context is running.
  useEffect(() => {
    if (!match || !game || !playerColor || audioEngine.isInitialized || audioPromptDismissedRef.current) {
      return;
    }
    const timer = setTimeout(() => {
      setShowAudioPrompt(true);
    }, 500);
    return () => clearTimeout(timer);
  }, [match, game, playerColor, audioEngine.isInitialized]);

  const handleAudioPromptOpenChange = (open: boolean) => {
    if (!open) {
      audioPromptDismissedRef.current = true;
    }
    setShowAudioPrompt(open);
  };

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

    setLastMove({ from, to });

    // Get updated game state after the move
    const updatedGameState = game.getGameState();
    // Numbered from the position rather than the moves array, so the number stays
    // correct even when the array is out of sync. The move we just played is the
    // most recent half-move.
    const moveNumber = game.getHalfMoveCount();

    // Force re-render
    setGameStateKey(prev => prev + 1);

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
        setGameStateKey(prev => prev + 1);
        setLastMove(null);
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

    // Reset game state locally
    if (game) {
      game.loadFen(INITIAL_FEN);
      setGameStateKey(prev => prev + 1);
      setLastMove(null);
    }

    // Delete all old moves from the database to ensure clean restart
    const { error: deleteError } = await supabase
      .from('moves')
      .delete()
      .eq('match_id', matchId);

    if (deleteError) {
      console.error('Error deleting old moves:', deleteError);
      // Continue anyway - the restart should still work
    }

    // Update match with initial FEN and reset status
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        current_fen: INITIAL_FEN,
        status: 'active',
        winner_id: null,
        finished_at: null,
      })
      .eq('id', matchId);

    if (updateError) {
      console.error('Error updating match on restart:', updateError);
    }
  };

  const handleEndRoom = async () => {
    if (!match || !isCreator) return;

    // First update match status to 'finished' so other players see the message
    // This will trigger the realtime update that shows roomEndedMessage
    await supabase
      .from('matches')
      .update({ status: 'finished' })
      .eq('id', matchId);

    // Wait a moment for the realtime update to propagate, then redirect
    setTimeout(() => {
      router.push('/');
    }, 1000);
  };


  if (realtimeError && !match) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 space-y-4">
            <Alert variant="destructive">
              <AlertTitle>Could not load room</AlertTitle>
              <AlertDescription>
                The room could not be loaded. {realtimeError}
              </AlertDescription>
            </Alert>
            <Button asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || !match || !game || !playerColor) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Skeleton className="w-full max-w-2xl aspect-square rounded-lg" />
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
  const statusLine = boardStatus(match.status, gameState, isMyTurn);

  const markInviteCopy = (next: InviteCopyState) => {
    setInviteCopyState(next);
    window.setTimeout(() => setInviteCopyState('idle'), 2000);
  };

  const handleCopyInvite = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?join=${roomCode}`);
      markInviteCopy('copied');
    } catch {
      markInviteCopy('failed');
    }
  };

  const handleShareInvite = async () => {
    if (typeof navigator.share !== 'function') return;
    try {
      await navigator.share({
        title: '64 Squares',
        url: `${window.location.origin}/?join=${roomCode}`,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      markInviteCopy('failed');
    }
  };

  const inviteCopyLabel = inviteCopyState === 'copied'
    ? 'Copied'
    : inviteCopyState === 'failed'
      ? 'Copy failed'
      : 'Copy';

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4 overflow-x-hidden">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
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
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-start sm:items-center w-full sm:w-auto">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm sm:text-base text-muted-foreground">Room Code:</span>
              <Badge variant="outline" className="font-mono text-sm sm:text-base px-3 py-1.5">{roomCode}</Badge>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCopyInvite}
                size="sm"
                className="h-8 px-2"
                aria-label="Copy invite link"
              >
                {inviteCopyState === 'copied' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="text-xs">{inviteCopyLabel}</span>
              </Button>
              {canShareInvite && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleShareInvite}
                  size="sm"
                  className="h-8 px-2"
                  aria-label="Share invite link"
                >
                  <Share2 className="h-4 w-4" />
                  <span className="text-xs">Share</span>
                </Button>
              )}
            </div>
            <Button variant="ghost" asChild className="text-sm sm:text-base">
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </header>

        {/* Player Names and Room Name */}
        <div className="text-center mb-4 sm:mb-6">
          <h2 className="text-2xl sm:text-4xl font-bold mb-2">
            {getPlayerDisplayName('w')} vs {getPlayerDisplayName('b')}
          </h2>
          {match.room_name && (
            <p className="text-sm sm:text-lg text-muted-foreground">{match.room_name}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-10 gap-4">
          {/* Main board area - 70% width on desktop */}
          <div className="lg:col-span-7 space-y-4">
            <Card>
              <CardContent className="px-0 sm:px-6 pt-4 sm:pt-6 space-y-4">
            {(opponentJoinedMessage || roomEndedMessage || realtimeError) && (
            <div className="px-2 sm:px-0 space-y-4">
            {opponentJoinedMessage && (
              <Alert>
                <AlertTitle>👋 Player Joined</AlertTitle>
                <AlertDescription>{opponentJoinedMessage}</AlertDescription>
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
            </div>
            )}

            {/* Audio prompt dialog - shows when player joins */}
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

            <div className="sticky top-0 z-10 sm:static flex flex-wrap items-center gap-2 bg-card px-2 sm:px-0 py-2">
              <Badge variant={statusLine.variant}>{statusLine.badge}</Badge>
              <span className="text-sm text-muted-foreground">{statusLine.detail}</span>
              {match.status === 'finished' && (
                <Button variant="outline" size="sm" asChild className="sm:ml-auto">
                  <Link href="/">Back to Home</Link>
                </Button>
              )}
            </div>

            <div key={gameStateKey}>
              <Board
                game={game}
                playerColor={playerColor}
                onMove={handleMove}
                orientation={playerColor}
                lastMove={lastMove}
                interactive={isMyTurn && match.status === 'active'}
              />
            </div>

            {/* Creator Controls */}
            {isCreator && (
              <div className="flex gap-4 mt-4 px-2 sm:px-0">
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

          {/* Sidebar with chat - 30% width on desktop, full width on mobile */}
          <div className="lg:col-span-3">
            <div className="lg:h-[600px]">
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
