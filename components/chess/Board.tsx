'use client';

import { useState, useCallback, useEffect } from 'react';
import { Square } from './Square';
import type { Square as SquareType, Color, PieceType } from '@/types/chess';
import { ChessGame } from '@/lib/chess/game';

interface BoardProps {
  game: ChessGame;
  playerColor: Color | null;
  onMove?: (from: SquareType, to: SquareType) => void;
  orientation?: Color; // 'w' or 'b' - which side is at the bottom
}

export function Board({ game, playerColor, onMove, orientation = 'w' }: BoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<SquareType | null>(null);
  const [legalMoves, setLegalMoves] = useState<SquareType[]>([]);
  const [lastMove, setLastMove] = useState<{ from: SquareType; to: SquareType } | null>(null);
  const [draggedSquare, setDraggedSquare] = useState<SquareType | null>(null);
  const [gameFen, setGameFen] = useState(() => game.getFen());
  const [forceUpdate, setForceUpdate] = useState(0);

  // Track game state changes - check FEN periodically to detect external updates
  // This is necessary because the game object reference doesn't change when internal state changes
  useEffect(() => {
    const interval = setInterval(() => {
      const currentFen = game.getFen();
      if (currentFen !== gameFen) {
        console.log('Board detected FEN change:', currentFen);
        setGameFen(currentFen);
        setForceUpdate(prev => prev + 1); // Force re-render

        // Try to detect the last move by comparing piece positions
        // This is a simple heuristic - we'll update lastMove if we can detect a change
        const gameState = game.getGameState();

        // Clear selection if the selected piece is not the current turn's color
        if (selectedSquare) {
          const piece = game.getPiece(selectedSquare);
          if (piece && piece.color !== gameState.turn) {
            setSelectedSquare(null);
            setLegalMoves([]);
          }
        }
      }
    }, 200); // Check every 200ms for changes

    return () => clearInterval(interval);
  }, [game, gameFen, selectedSquare]);

  // Also update when forceUpdate changes (triggered by parent component)
  useEffect(() => {
    const currentFen = game.getFen();
    if (currentFen !== gameFen) {
      setGameFen(currentFen);
    }
  }, [forceUpdate, game, gameFen]);

  // Update legal moves when selection changes
  useEffect(() => {
    if (selectedSquare) {
      const moves = game.getLegalMoves(selectedSquare);
      setLegalMoves(moves);
    } else {
      setLegalMoves([]);
    }
  }, [selectedSquare, game]);

  const handleSquareClick = useCallback((square: SquareType) => {
    const gameState = game.getGameState();

    // For solo play (playerColor is null or matches turn), allow moves for current turn
    // For multiplayer, check playerColor matches turn
    const canMove = playerColor === null || gameState.turn === playerColor;
    if (!canMove) {
      return;
    }

    if (selectedSquare) {
      // For multiplayer (playerColor is not null), don't make the move locally
      // Just call onMove and let the parent handle it
      if (playerColor !== null) {
        // Multiplayer mode - let parent handle the move
        onMove?.(selectedSquare, square);
        setSelectedSquare(null);
        setLegalMoves([]);
      } else {
        // Solo play - make the move locally
        const success = game.makeMove(selectedSquare, square);
        if (success) {
          setLastMove({ from: selectedSquare, to: square });
          setSelectedSquare(null);
          setLegalMoves([]);
          onMove?.(selectedSquare, square);
        } else {
          // If move failed, check if clicking on a piece of the same color
          const piece = game.getPiece(square);
          const selectedPiece = game.getPiece(selectedSquare);
          if (piece && piece.color === selectedPiece?.color) {
            // Select the new piece instead
            setSelectedSquare(square);
          } else {
            // Deselect
            setSelectedSquare(null);
          }
        }
      }
    } else {
      // Select a square if it has a piece of the current turn's color
      const piece = game.getPiece(square);
      if (piece && piece.color === gameState.turn) {
        setSelectedSquare(square);
      }
    }
  }, [selectedSquare, game, playerColor, onMove]);

  const handleDragStart = useCallback((square: SquareType) => {
    const piece = game.getPiece(square);
    const gameState = game.getGameState();
    // Allow dragging if it's the current turn's piece
    if (piece && piece.color === gameState.turn) {
      setSelectedSquare(square);
      setDraggedSquare(square);
    }
  }, [game]);

  const handleDragEnd = useCallback(() => {
    setDraggedSquare(null);
  }, []);

  const handleDrop = useCallback((square: SquareType) => {
    if (selectedSquare && draggedSquare === selectedSquare) {
      const gameState = game.getGameState();
      const canMove = playerColor === null || gameState.turn === playerColor;
      if (canMove) {
        // For multiplayer (playerColor is not null), don't make the move locally
        if (playerColor !== null) {
          // Multiplayer mode - let parent handle the move
          onMove?.(selectedSquare, square);
          setSelectedSquare(null);
          setLegalMoves([]);
        } else {
          // Solo play - make the move locally
          const success = game.makeMove(selectedSquare, square);
          if (success) {
            setLastMove({ from: selectedSquare, to: square });
            setSelectedSquare(null);
            setLegalMoves([]);
            onMove?.(selectedSquare, square);
          }
        }
      }
    }
  }, [selectedSquare, draggedSquare, game, playerColor, onMove]);

  // Generate board squares
  const squares: SquareType[] = [];
  const ranks = orientation === 'w' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === 'w' ? ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] : ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];

  ranks.forEach((rank) => {
    files.forEach((file) => {
      squares.push(`${file}${rank}` as SquareType);
    });
  });

  return (
    <div className="w-full max-w-2xl mx-auto border-4 border-amber-900 rounded-lg shadow-2xl overflow-hidden" style={{ aspectRatio: '1 / 1' }}>
      <div className="grid grid-cols-8 h-full w-full">
        {squares.map((square) => {
          const row = parseInt(square[1]);
          const col = square.charCodeAt(0) - 96; // a=1, b=2, etc.
          const isLight = (row + col) % 2 === 0;
          const piece = game.getPiece(square);
          const isSelected = selectedSquare === square;
          const isLegalMove = legalMoves.includes(square);
          const isLastMoveSquare = lastMove?.from === square || lastMove?.to === square;

          return (
            <Square
              key={square}
              square={square}
              isLight={isLight}
              piece={piece}
              isSelected={isSelected}
              isLegalMove={isLegalMove}
              isLastMove={isLastMoveSquare}
              onSquareClick={handleSquareClick}
              onPieceDragStart={handleDragStart}
              onPieceDragEnd={handleDragEnd}
              onPieceDrop={handleDrop}
            />
          );
        })}
      </div>
    </div>
  );
}
