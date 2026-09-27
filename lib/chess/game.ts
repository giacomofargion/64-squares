import { Chess } from 'chess.js';
import type { Move, GameState, Square, Color, PieceType } from '@/types/chess';

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * The parts of a FEN that identify a position: piece placement, side to move,
 * castling rights and en passant square. The half-move and full-move counters are
 * left out so positions can be compared regardless of how they were reached.
 */
function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

/**
 * Finds the single legal move that turns `from` into `to`.
 *
 * Returns null when the positions are identical or more than one move apart, which
 * is how a board that fell several moves behind catches up silently instead of
 * guessing which move to announce.
 */
export function findConnectingMove(fromFen: string, toFen: string): Move | null {
  const targetKey = positionKey(toFen);
  if (positionKey(fromFen) === targetKey) {
    return null;
  }

  let chess: Chess;
  try {
    chess = new Chess(fromFen);
  } catch {
    return null;
  }

  for (const candidate of chess.moves({ verbose: true })) {
    chess.move({ from: candidate.from, to: candidate.to, promotion: candidate.promotion });
    const reachesTarget = positionKey(chess.fen()) === targetKey;
    chess.undo();

    if (reachesTarget) {
      return {
        from: candidate.from,
        to: candidate.to,
        promotion: candidate.promotion as PieceType | undefined,
        captured: candidate.captured as PieceType | undefined,
      };
    }
  }

  return null;
}

export class ChessGame {
  private chess: Chess;
  private onMoveCallback?: (move: Move, captured: boolean, capturedRow?: number) => void;

  constructor(fen?: string) {
    this.chess = new Chess(fen);
  }

  /**
   * Set callback for when a move is made
   */
  setOnMove(callback: (move: Move, captured: boolean, capturedRow?: number) => void) {
    this.onMoveCallback = callback;
  }

  /**
   * Make a move from one square to another
   */
  makeMove(from: Square, to: Square, promotion?: string): boolean {
    try {
      // Check if this is a pawn promotion move (pawn moving to rank 1 or 8)
      const piece = this.chess.get(from as any);
      const isPawn = piece && piece.type === 'p';
      const isPromotionSquare = to[1] === '1' || to[1] === '8';
      const isPromotionMove = isPawn && isPromotionSquare;

      // If it's a promotion move and no promotion is specified, default to queen
      const effectivePromotion = isPromotionMove && !promotion ? 'q' : promotion;

      // Validate that it's a legal move
      const legalMoves = this.chess.moves({ verbose: true });
      const isValidMove = legalMoves.some(
        m => m.from === from && m.to === to && (!effectivePromotion || m.promotion === effectivePromotion)
      );

      if (!isValidMove) {
        console.warn('Move is not in legal moves list:', { from, to, promotion: effectivePromotion });
        return false;
      }

      const move = this.chess.move({
        from,
        to,
        promotion: effectivePromotion as any,
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
   * The FEN that would result from playing `from`-`to` in the current position, or
   * null when that move is not legal here. Leaves this game untouched, so no move
   * callback fires.
   */
  fenAfterMove(from: Square, to: Square, promotion?: string): string | null {
    const probe = new ChessGame(this.chess.fen());
    return probe.makeMove(from, to, promotion) ? probe.getFen() : null;
  }

  /**
   * Get legal moves for a square
   */
  getLegalMoves(square: Square): Square[] {
    try {
      const moves = this.chess.moves({ square: square as any, verbose: true });
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
   * How many half-moves have been played to reach the current position, so the
   * move just played is number `getHalfMoveCount()`.
   *
   * Read from the FEN rather than chess.js `history()`, which is empty for a game
   * loaded from a FEN partway through.
   */
  getHalfMoveCount(): number {
    const fenParts = this.chess.fen().split(' ');
    const fullMoveNumber = Number(fenParts[5]);

    if (!Number.isInteger(fullMoveNumber) || fullMoveNumber < 1) {
      return this.chess.history().length;
    }

    // The full-move number counts white/black pairs and only advances once black
    // has replied, so each completed pair is two half-moves. Black being to move
    // means white has already played the odd half-move of the current pair.
    const whiteHasPlayedCurrentPair = fenParts[1] === 'b';
    return (fullMoveNumber - 1) * 2 + (whiteHasPlayedCurrentPair ? 1 : 0);
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
    const piece = this.chess.get(square as any);
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
