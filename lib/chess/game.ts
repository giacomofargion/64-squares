import { Chess } from 'chess.js';
import type { Move, GameState, Square, Color, PieceType } from '@/types/chess';

export class ChessGame {
  private chess: Chess;
  private onMoveCallback?: (move: Move, captured: boolean, capturedRow?: number) => void;

  constructor(fen?: string) {
    this.chess = new Chess(fen);
  }

  /**
   * Set callback for when a move is made
   */
  setOnMove(callback: ((move: Move, captured: boolean, capturedRow?: number) => void) | null | undefined) {
    this.onMoveCallback = callback || undefined;
  }

  /**
   * Get the current onMove callback
   */
  getOnMoveCallback(): ((move: Move, captured: boolean, capturedRow?: number) => void) | undefined {
    return this.onMoveCallback;
  }

  /**
   * Make a move from one square to another
   */
  makeMove(from: Square, to: Square, promotion?: string): boolean {
    try {
      // Validate that it's a legal move
      const legalMoves = this.chess.moves({ verbose: true });
      const isValidMove = legalMoves.some(
        m => m.from === from && m.to === to && (!promotion || m.promotion === promotion)
      );

      if (!isValidMove) {
        console.warn('Move is not in legal moves list:', { from, to, promotion });
        return false;
      }

      const move = this.chess.move({
        from,
        to,
        promotion: promotion as any,
      });

      if (!move) {
        console.warn('chess.js rejected move:', { from, to, promotion });
        return false;
      }

      // Check if a piece was captured
      const captured = move.captured !== undefined;
      let capturedRow: number | undefined;

      if (captured && move.to) {
        // Extract row from the destination square (e.g., "e4" -> 4)
        capturedRow = parseInt(move.to[1]);
      }

      // Call the callback
      this.onMoveCallback?.({
        from: move.from,
        to: move.to,
        promotion: move.promotion as PieceType | undefined,
        captured: move.captured as PieceType | undefined,
      }, captured, capturedRow);

      return true;
    } catch (error) {
      console.error('Invalid move:', { from, to, promotion, error, fen: this.chess.fen(), turn: this.chess.turn() });
      return false;
    }
  }

  /**
   * Get legal moves for a square
   */
  getLegalMoves(square: Square): Square[] {
    try {
      const moves = this.chess.moves({ square, verbose: true });
      return moves.map(move => move.to as Square);
    } catch {
      return [];
    }
  }

  /**
   * Get all legal moves
   */
  getAllLegalMoves(): Array<{ from: Square; to: Square }> {
    const moves = this.chess.moves({ verbose: true });
    return moves.map(move => ({
      from: move.from as Square,
      to: move.to as Square,
    }));
  }

  /**
   * Get current game state
   */
  getGameState(): GameState {
    return {
      fen: this.chess.fen(),
      turn: this.chess.turn() as Color,
      isCheck: this.chess.inCheck(),
      isCheckmate: this.chess.isCheckmate(),
      isStalemate: this.chess.isStalemate(),
      isDraw: this.chess.isDraw(),
    };
  }

  /**
   * Get the current FEN string
   */
  getFen(): string {
    return this.chess.fen();
  }

  /**
   * Get the current move number (1-indexed)
   * This is calculated from the game history, not from external move records
   */
  getMoveNumber(): number {
    // chess.js history() returns all moves made so far
    // However, if the game was loaded from FEN, history() might be empty
    // So we parse the FEN to get the fullmove number and calculate from that
    const fen = this.chess.fen();
    const fenParts = fen.split(' ');
    if (fenParts.length >= 5) {
      const fullmoveNumber = parseInt(fenParts[5], 10) || 1;
      const turn = fenParts[1]; // 'w' or 'b'
      // If it's white's turn, we're about to make move (fullmove-1)*2 + 1
      // If it's black's turn, we're about to make move (fullmove-1)*2 + 2
      if (turn === 'w') {
        return (fullmoveNumber - 1) * 2 + 1;
      } else {
        return (fullmoveNumber - 1) * 2 + 2;
      }
    }
    // Fallback: use history length + 1
    return this.chess.history().length + 1;
  }

  /**
   * Load a game from FEN
   */
  loadFen(fen: string): boolean {
    try {
      this.chess.load(fen);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the piece on a square
   */
  getPiece(square: Square): { type: PieceType; color: Color } | null {
    const piece = this.chess.get(square);
    if (!piece) return null;
    return {
      type: piece.type as PieceType,
      color: piece.color as Color,
    };
  }

  /**
   * Check if the game is over
   */
  isGameOver(): boolean {
    return this.chess.isGameOver();
  }

  /**
   * Get the winner (if any)
   */
  getWinner(): Color | null {
    if (this.chess.isCheckmate()) {
      return this.chess.turn() === 'w' ? 'b' : 'w';
    }
    return null;
  }

  /**
   * Reset the game
   */
  reset(): void {
    this.chess.reset();
  }
}
