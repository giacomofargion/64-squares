import { Chess } from 'chess.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChessGame, INITIAL_FEN, findConnectingMove } from '@/lib/chess/game';

const MID_GAME_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';

function play(game: ChessGame, moves: Array<[string, string]>) {
  for (const [from, to] of moves) {
    expect(game.makeMove(from, to), `${from}-${to} from ${game.getFen()}`).toBe(true);
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getHalfMoveCount', () => {
  it('is 0 at the start, 1 after e4, and 2 after e5', () => {
    const game = new ChessGame();
    expect(game.getFen()).toBe(INITIAL_FEN);
    expect(game.getHalfMoveCount()).toBe(0);

    play(game, [['e2', 'e4']]);
    expect(game.getHalfMoveCount()).toBe(1);
    expect(game.getFen().split(' ')[1]).toBe('b');
    expect(game.getFen().split(' ')[5]).toBe('1');

    play(game, [['e7', 'e5']]);
    expect(game.getHalfMoveCount()).toBe(2);
    expect(game.getFen().split(' ')[5]).toBe('2');
  });

  it('reads a mid-game FEN instead of the empty chess.js history', () => {
    // After 1. e4 e5 2. Nf3. history() is empty because the game was not replayed.
    expect(new Chess(MID_GAME_FEN).history()).toHaveLength(0);
    expect(new ChessGame(MID_GAME_FEN).getHalfMoveCount()).toBe(3);

    const game = new ChessGame();
    play(game, [['e2', 'e4']]);
    expect(game.loadFen(MID_GAME_FEN)).toBe(true);
    expect(new Chess(game.getFen()).history()).toHaveLength(0);
    expect(game.getHalfMoveCount()).toBe(3);
  });
});

describe('ChessGame rules', () => {
  it('castles kingside', () => {
    const white = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(white.makeMove('e1', 'g1')).toBe(true);
    expect(white.getPiece('g1')?.type).toBe('k');
    expect(white.getPiece('f1')?.type).toBe('r');

    const black = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    expect(black.makeMove('e8', 'g8')).toBe(true);
    expect(black.getPiece('g8')?.type).toBe('k');
    expect(black.getPiece('f8')?.type).toBe('r');
  });

  it('plays en passant and reports it as a capture', () => {
    const game = new ChessGame();
    play(game, [
      ['e2', 'e4'],
      ['a7', 'a6'],
      ['e4', 'e5'],
      ['d7', 'd5'],
    ]);
    expect(game.getLegalMoves('e5')).toContain('d6');

    let captured = false;
    game.setOnMove((_move, wasCapture) => {
      captured = wasCapture;
    });
    expect(game.makeMove('e5', 'd6')).toBe(true);
    expect(game.getPiece('d6')).toEqual({ type: 'p', color: 'w' });
    expect(game.getPiece('d5')).toBeNull();
    expect(captured).toBe(true);
  });

  it('promotes a pawn to a queen when promotion is omitted', () => {
    const game = new ChessGame('k7/4P3/8/8/8/8/8/4K3 w - - 0 1');
    let promotion: string | undefined;
    game.setOnMove((move) => {
      promotion = move.promotion;
    });
    expect(game.makeMove('e7', 'e8')).toBe(true);
    expect(game.getPiece('e8')?.type).toBe('q');
    expect(promotion).toBe('q');
  });

  it('rejects an illegal move and leaves the position unchanged', () => {
    const game = new ChessGame();
    const before = game.getFen();
    expect(game.makeMove('e2', 'e5')).toBe(false);
    expect(game.makeMove('e7', 'e5')).toBe(false);
    expect(game.getFen()).toBe(before);
  });

  it('castles queenside', () => {
    const white = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(white.makeMove('e1', 'c1')).toBe(true);
    expect(white.getPiece('c1')?.type).toBe('k');
    expect(white.getPiece('d1')?.type).toBe('r');

    const black = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
    expect(black.makeMove('e8', 'c8')).toBe(true);
    expect(black.getPiece('c8')?.type).toBe('k');
    expect(black.getPiece('d8')?.type).toBe('r');
  });

  it('still accepts an explicit underpromotion to a knight', () => {
    const game = new ChessGame('k7/4P3/8/8/8/8/8/4K3 w - - 0 1');
    expect(game.makeMove('e7', 'e8', 'n')).toBe(true);
    expect(game.getPiece('e8')?.type).toBe('n');
  });

  it('detects fool\'s mate, stalemate, and insufficient material', () => {
    const mate = new ChessGame();
    play(mate, [
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['g2', 'g4'],
      ['d8', 'h4'],
    ]);
    expect(mate.getGameState().isCheckmate).toBe(true);
    expect(mate.getWinner()).toBe('b');

    const stale = new ChessGame('7k/5Q2/8/8/8/8/8/4K3 b - - 0 1');
    expect(stale.getGameState().isStalemate).toBe(true);
    expect(stale.getWinner()).toBeNull();

    const bareKings = new ChessGame('4k3/8/8/8/8/8/8/4K3 w - - 0 1');
    expect(bareKings.getGameState().isDraw).toBe(true);
    expect(bareKings.getGameState().isStalemate).toBe(false);
  });

  it('previews a move without changing the live game', () => {
    const game = new ChessGame();
    const before = game.getFen();
    expect(game.fenAfterMove('e2', 'e4')).toContain('4P3');
    expect(game.getFen()).toBe(before);
    expect(game.fenAfterMove('e2', 'e5')).toBeNull();
    expect(game.getLegalMoves('e2')).toEqual(expect.arrayContaining(['e3', 'e4']));
  });
});

describe('findConnectingMove', () => {
  it('returns the one legal step, including a capture', () => {
    const game = new ChessGame();
    game.makeMove('e2', 'e4');
    const afterE4 = game.getFen();
    expect(findConnectingMove(INITIAL_FEN, afterE4)).toMatchObject({ from: 'e2', to: 'e4' });

    game.makeMove('d7', 'd5');
    const beforeCapture = game.getFen();
    game.makeMove('e4', 'd5');
    expect(findConnectingMove(beforeCapture, game.getFen())).toMatchObject({
      from: 'e4',
      to: 'd5',
      captured: 'p',
    });
  });

  it('returns null for identical positions, including when only the move counters differ', () => {
    expect(findConnectingMove(INITIAL_FEN, INITIAL_FEN)).toBeNull();
    const samePiecesLater = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 9';
    expect(findConnectingMove(INITIAL_FEN, samePiecesLater)).toBeNull();
  });

  it('returns null when the positions are more than one move apart', () => {
    const game = new ChessGame();
    play(game, [
      ['e2', 'e4'],
      ['e7', 'e5'],
    ]);
    expect(findConnectingMove(INITIAL_FEN, game.getFen())).toBeNull();
  });

  it('returns null for an illegal or garbage FEN', () => {
    expect(findConnectingMove('not a fen', INITIAL_FEN)).toBeNull();
    expect(findConnectingMove(INITIAL_FEN, 'not a fen')).toBeNull();
    expect(findConnectingMove('nope', 'also-nope')).toBeNull();
  });

  it('recognises castling, en passant, and auto-queen promotion as one step', () => {
    const castleFrom = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const castle = new ChessGame(castleFrom);
    castle.makeMove('e1', 'g1');
    expect(findConnectingMove(castleFrom, castle.getFen())).toMatchObject({ from: 'e1', to: 'g1' });

    const game = new ChessGame();
    play(game, [
      ['e2', 'e4'],
      ['a7', 'a6'],
      ['e4', 'e5'],
      ['d7', 'd5'],
    ]);
    const beforeEp = game.getFen();
    game.makeMove('e5', 'd6');
    expect(findConnectingMove(beforeEp, game.getFen())).toMatchObject({
      from: 'e5',
      to: 'd6',
      captured: 'p',
    });

    const promoFrom = 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1';
    const promo = new ChessGame(promoFrom);
    promo.makeMove('e7', 'e8');
    expect(findConnectingMove(promoFrom, promo.getFen())).toMatchObject({
      from: 'e7',
      to: 'e8',
      promotion: 'q',
    });
  });
});
