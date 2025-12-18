'use client';

import type { PieceType, Color } from '@/types/chess';
import Image from 'next/image';

interface PieceProps {
  type: PieceType;
  color: Color;
  isDragging?: boolean;
}

// Map piece types to file names
const pieceNameMap: Record<PieceType, string> = {
  p: 'pawn',
  r: 'rook',
  n: 'knight',
  b: 'bishop',
  q: 'queen',
  k: 'king',
};

export function Piece({ type, color, isDragging }: PieceProps) {
  const pieceName = pieceNameMap[type];
  const colorSuffix = color === 'w' ? 'w' : 'b';
  const imagePath = `/chess-pieces/${pieceName}-${colorSuffix}.svg`;

  return (
    <div
      className={`
        w-full h-full select-none
        flex items-center justify-center
        ${isDragging ? 'opacity-50 scale-110' : ''}
        transition-transform duration-150
        relative
      `}
    >
      <Image
        src={imagePath}
        alt={`${color === 'w' ? 'White' : 'Black'} ${pieceName}`}
        width={45}
        height={45}
        className="w-[85%] h-[85%] object-contain"
        style={{
          filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.5))',
        }}
        priority
      />
    </div>
  );
}
