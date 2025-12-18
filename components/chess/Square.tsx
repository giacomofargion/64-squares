'use client';

import { Piece } from './Piece';
import type { Square as SquareType, Color, PieceType } from '@/types/chess';

interface SquareProps {
  square: SquareType;
  isLight: boolean;
  piece: { type: PieceType; color: Color } | null;
  isSelected?: boolean;
  isLegalMove?: boolean;
  isLastMove?: boolean;
  onSquareClick?: (square: SquareType) => void;
  onPieceDragStart?: (square: SquareType) => void;
  onPieceDragEnd?: () => void;
  onPieceDrop?: (square: SquareType) => void;
}

export function Square({
  square,
  isLight,
  piece,
  isSelected = false,
  isLegalMove = false,
  isLastMove = false,
  onSquareClick,
  onPieceDragStart,
  onPieceDragEnd,
  onPieceDrop,
}: SquareProps) {
  const handleDragStart = (e: React.DragEvent) => {
    if (piece) {
      e.dataTransfer.effectAllowed = 'move';
      onPieceDragStart?.(square);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    onPieceDrop?.(square);
    onPieceDragEnd?.();
  };

  // Wooden chess board colors
  const bgColor = isLight
    ? isSelected
      ? 'bg-yellow-300'
      : isLegalMove
      ? 'bg-green-300'
      : isLastMove
      ? 'bg-blue-300'
      : 'bg-amber-50' // Light wood color
    : isSelected
    ? 'bg-yellow-700'
    : isLegalMove
    ? 'bg-green-700'
    : isLastMove
    ? 'bg-blue-700'
    : 'bg-amber-900'; // Dark wood color

  return (
    <div
      className={`
        ${bgColor}
        flex items-center justify-center
        cursor-pointer
        relative
        transition-colors duration-150
        border border-amber-800/20
        shadow-sm
      `}
      style={{
        aspectRatio: '1 / 1',
        width: '100%',
        height: '100%',
        backgroundImage: isLight
          ? 'linear-gradient(135deg, rgba(251, 243, 219, 0.3) 0%, rgba(245, 230, 200, 0.5) 100%)'
          : 'linear-gradient(135deg, rgba(120, 53, 15, 0.8) 0%, rgba(92, 40, 12, 0.9) 100%)',
      }}
      onClick={() => onSquareClick?.(square)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {piece && (
        <div
          draggable
          onDragStart={handleDragStart}
          className="w-full h-full flex items-center justify-center"
        >
          <Piece type={piece.type} color={piece.color} />
        </div>
      )}
      {isLegalMove && !piece && (
        <div className="absolute w-1/3 h-1/3 rounded-full bg-green-500 opacity-50" />
      )}
      {/* Square label for debugging (can be removed) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-0 left-0 text-xs opacity-30 p-1">
          {square}
        </div>
      )}
    </div>
  );
}
