'use client';

import type { PieceType, Color } from '@/types/chess';

interface PieceProps {
  type: PieceType;
  color: Color;
  isDragging?: boolean;
}

const pieceSymbols: Record<Color, Record<PieceType, string>> = {
  w: {
    p: '♙',
    r: '♖',
    n: '♘',
    b: '♗',
    q: '♕',
    k: '♔',
  },
  b: {
    p: '♟',
    r: '♜',
    n: '♞',
    b: '♝',
    q: '♛',
    k: '♚',
  },
};

export function Piece({ type, color, isDragging }: PieceProps) {
  const symbol = pieceSymbols[color][type];
  const isWhite = color === 'w';

  return (
    <div
      className={`
        text-4xl md:text-5xl select-none
        ${isDragging ? 'opacity-50 scale-110' : ''}
        transition-transform duration-150
        relative
        ${isWhite
          ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] filter brightness-110'
          : 'text-gray-900 drop-shadow-[0_2px_4px_rgba(255,255,255,0.3)] filter brightness-90'
        }
      `}
      style={{
        textShadow: isWhite
          ? '2px 2px 4px rgba(0,0,0,0.9), -1px -1px 2px rgba(0,0,0,0.5)'
          : '2px 2px 4px rgba(255,255,255,0.5), -1px -1px 2px rgba(255,255,255,0.3)',
        WebkitTextStroke: isWhite ? '0.5px rgba(0,0,0,0.3)' : '0.5px rgba(255,255,255,0.2)',
      }}
    >
      {symbol}
    </div>
  );
}
