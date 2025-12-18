export type PieceType = 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
export type Color = 'w' | 'b';
export type Square = string; // e.g., "e4"

export interface Move {
  from: Square;
  to: Square;
  promotion?: PieceType;
  captured?: PieceType;
}

export interface GameState {
  fen: string;
  turn: Color;
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
}
