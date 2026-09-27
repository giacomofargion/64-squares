/**
 * Node tests for chess helpers used by the match page.
 * Bundles lib/chess/game.ts with esbuild so we exercise the real source.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const esbuildBin = '/tmp/audio-probe/node_modules/.bin/esbuild';

mkdirSync('/tmp/64squares-tests', { recursive: true });
const outfile = '/tmp/64squares-tests/game.mjs';

execFileSync(esbuildBin, [
  '/workspace/lib/chess/game.ts',
  '--bundle',
  '--platform=node',
  '--format=esm',
  `--outfile=${outfile}`,
  '--tsconfig=/workspace/tsconfig.json',
  '--log-level=warning',
]);

const { ChessGame, findConnectingMove, INITIAL_FEN } = await import(pathToFileURL(outfile).href);

const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ name, pass: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, pass: false, error: err instanceof Error ? err.message : String(err) });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err instanceof Error ? err.stack : err}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function play(game, moves) {
  for (const [from, to] of moves) {
    const ok = game.makeMove(from, to);
    assert(ok, `expected ${from}-${to} to be legal, FEN=${game.getFen()}`);
  }
}

check('INITIAL_FEN is the standard starting position', () => {
  const game = new ChessGame();
  assert(game.getFen() === INITIAL_FEN, `got ${game.getFen()}`);
  assert(game.getHalfMoveCount() === 0, `start should be 0 half-moves, got ${game.getHalfMoveCount()}`);
});

check('getHalfMoveCount starts at 1 after White e4 (the recorded bug was 2)', () => {
  const game = new ChessGame();
  play(game, [['e2', 'e4']]);
  assert(game.getHalfMoveCount() === 1, `got ${game.getHalfMoveCount()} FEN=${game.getFen()}`);
  const fenParts = game.getFen().split(' ');
  assert(fenParts[1] === 'b', 'black to move');
  assert(fenParts[5] === '1', 'full-move number stays 1 until Black replies');
});

check('getHalfMoveCount is 2 after 1. e4 e5', () => {
  const game = new ChessGame();
  play(game, [['e2', 'e4'], ['e7', 'e5']]);
  assert(game.getHalfMoveCount() === 2, `got ${game.getHalfMoveCount()}`);
  assert(game.getFen().split(' ')[5] === '2', 'full-move number advances after Black');
});

check('getHalfMoveCount is 3 after 1. e4 e5 2. Nf3', () => {
  const game = new ChessGame();
  play(game, [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3']]);
  assert(game.getHalfMoveCount() === 3, `got ${game.getHalfMoveCount()}`);
});

check('getHalfMoveCount works when the game is loaded from a mid-game FEN (no history)', () => {
  // Position after 1. e4 e5 2. Nf3 — white has played 2, black 1, fullmove 2, black to move? Wait:
  // After Nf3 it is black to move, fullmove 2. Half-moves = 3.
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
  const game = new ChessGame(fen);
  assert(game.getHalfMoveCount() === 3, `got ${game.getHalfMoveCount()}`);
});

check('illegal pawn leap e2-e5 is rejected and FEN is unchanged', () => {
  const game = new ChessGame();
  const before = game.getFen();
  assert(game.makeMove('e2', 'e5') === false, 'e2-e5 should be illegal');
  assert(game.getFen() === before, 'FEN must not change on illegal move');
});

check('cannot move the opponent piece on White to move', () => {
  const game = new ChessGame();
  assert(game.makeMove('e7', 'e5') === false, 'black pawn on white turn');
});

check('legal pawn double-step e2-e4 is accepted', () => {
  const game = new ChessGame();
  assert(game.makeMove('e2', 'e4') === true, 'e2-e4 should be legal');
  assert(game.getPiece('e4')?.type === 'p', 'pawn should sit on e4');
  assert(game.getPiece('e2') === null, 'e2 should be empty');
});

check('captures are flagged and capturedRow is the destination rank', () => {
  const game = new ChessGame();
  let seen = null;
  game.setOnMove((move, captured, capturedRow) => {
    seen = { move, captured, capturedRow };
  });
  play(game, [['e2', 'e4'], ['d7', 'd5'], ['e4', 'd5']]);
  assert(seen?.captured === true, 'capture callback should fire');
  assert(seen?.capturedRow === 5, `capturedRow should be 5, got ${seen?.capturedRow}`);
  assert(seen?.move.captured === 'p', `captured piece should be pawn, got ${seen?.move.captured}`);
});

check('kingside castling both colours', () => {
  const white = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert(white.makeMove('e1', 'g1') === true, 'white O-O');
  assert(white.getPiece('g1')?.type === 'k', 'white king on g1');
  assert(white.getPiece('f1')?.type === 'r', 'white rook on f1');
  // Independent position: after White O-O the rook on f1 would attack f8 and
  // illegally block Black's castle, so Black is tested from a fresh FEN.
  const black = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
  assert(black.makeMove('e8', 'g8') === true, 'black O-O');
  assert(black.getPiece('g8')?.type === 'k', 'black king on g8');
  assert(black.getPiece('f8')?.type === 'r', 'black rook on f8');
});

check('queenside castling both colours', () => {
  const white = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert(white.makeMove('e1', 'c1') === true, 'white O-O-O');
  assert(white.getPiece('c1')?.type === 'k', 'white king on c1');
  assert(white.getPiece('d1')?.type === 'r', 'white rook on d1');
  const black = new ChessGame('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
  assert(black.makeMove('e8', 'c8') === true, 'black O-O-O');
  assert(black.getPiece('c8')?.type === 'k');
  assert(black.getPiece('d8')?.type === 'r');
});

check('en passant capture', () => {
  // After 1. e4 a6 2. e5 d5, White can take en passant e5xd6
  const game = new ChessGame();
  play(game, [['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5']]);
  const legal = game.getLegalMoves('e5');
  assert(legal.includes('d6'), `en passant d6 should be legal, got ${legal.join(',')}`);
  let seen = null;
  game.setOnMove((move, captured) => {
    seen = { move, captured };
  });
  assert(game.makeMove('e5', 'd6') === true, 'en passant should succeed');
  assert(game.getPiece('d6')?.type === 'p' && game.getPiece('d6')?.color === 'w', 'white pawn on d6');
  assert(game.getPiece('d5') === null, 'black pawn on d5 should be gone');
  assert(seen?.captured === true, 'en passant is a capture');
});

check('pawn auto-promotes to queen when promotion is omitted', () => {
  const fen = 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1';
  const game = new ChessGame(fen);
  let seen = null;
  game.setOnMove((move) => {
    seen = move;
  });
  assert(game.makeMove('e7', 'e8') === true, 'e7-e8 should auto-promote');
  assert(game.getPiece('e8')?.type === 'q', `expected queen, got ${game.getPiece('e8')?.type}`);
  assert(seen?.promotion === 'q', `callback promotion=${seen?.promotion}`);
});

check('explicit underpromotion to knight is still legal in the engine', () => {
  const fen = 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1';
  const game = new ChessGame(fen);
  assert(game.makeMove('e7', 'e8', 'n') === true, 'underpromotion to knight');
  assert(game.getPiece('e8')?.type === 'n', `got ${game.getPiece('e8')?.type}`);
});

check('check is detected; checkmate of fool\'s mate', () => {
  const game = new ChessGame();
  play(game, [['f2', 'f3'], ['e7', 'e5'], ['g2', 'g4']]);
  const before = game.getGameState();
  assert(before.isCheck === false, 'not yet check');
  play(game, [['d8', 'h4']]);
  const after = game.getGameState();
  assert(after.isCheckmate === true, 'fool\'s mate should be checkmate');
  assert(after.isCheck === true, 'checkmate implies check');
  assert(game.getWinner() === 'b', `winner should be black, got ${game.getWinner()}`);
  assert(game.isGameOver() === true, 'game over');
});

check('stalemate is detected', () => {
  // King h8, queen f7: Black to move, no legal squares, not in check.
  const fen = '7k/5Q2/8/8/8/8/8/4K3 b - - 0 1';
  const game = new ChessGame(fen);
  const state = game.getGameState();
  assert(state.isStalemate === true, 'expected stalemate');
  assert(state.isDraw === true, 'stalemate is a draw');
  assert(state.isCheckmate === false, 'not checkmate');
  assert(game.getWinner() === null, 'stalemate has no winner');
});

check('insufficient material is a draw', () => {
  const fen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
  const game = new ChessGame(fen);
  const state = game.getGameState();
  assert(state.isDraw === true, 'KK is a draw');
  assert(state.isStalemate === false, 'kings can still move, so not stalemate');
});

check('findConnectingMove returns the single linking ply', () => {
  const from = INITIAL_FEN;
  const game = new ChessGame();
  game.makeMove('e2', 'e4');
  const to = game.getFen();
  const move = findConnectingMove(from, to);
  assert(move?.from === 'e2' && move?.to === 'e4', `got ${JSON.stringify(move)}`);
});

check('findConnectingMove returns null for identical positions', () => {
  assert(findConnectingMove(INITIAL_FEN, INITIAL_FEN) === null, 'identical');
});

check('findConnectingMove returns null when positions are two plies apart', () => {
  const game = new ChessGame();
  play(game, [['e2', 'e4'], ['e7', 'e5']]);
  assert(findConnectingMove(INITIAL_FEN, game.getFen()) === null, 'two plies');
});

check('findConnectingMove understands castling as one connecting move', () => {
  const from = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  const white = new ChessGame(from);
  white.makeMove('e1', 'g1');
  const move = findConnectingMove(from, white.getFen());
  assert(move?.from === 'e1' && move?.to === 'g1', `got ${JSON.stringify(move)}`);
});

check('findConnectingMove understands en passant', () => {
  const game = new ChessGame();
  play(game, [['e2', 'e4'], ['a7', 'a6'], ['e4', 'e5'], ['d7', 'd5']]);
  const from = game.getFen();
  game.makeMove('e5', 'd6');
  const move = findConnectingMove(from, game.getFen());
  assert(move?.from === 'e5' && move?.to === 'd6', `got ${JSON.stringify(move)}`);
  assert(move?.captured === 'p', `en passant should report captured pawn, got ${move?.captured}`);
});

check('findConnectingMove understands auto-queen promotion', () => {
  const from = 'k7/4P3/8/8/8/8/8/4K3 w - - 0 1';
  const game = new ChessGame(from);
  game.makeMove('e7', 'e8');
  const move = findConnectingMove(from, game.getFen());
  assert(move?.from === 'e7' && move?.to === 'e8', `got ${JSON.stringify(move)}`);
  assert(move?.promotion === 'q', `promotion should be q, got ${move?.promotion}`);
});

check('fenAfterMove is pure and does not mutate the game', () => {
  const game = new ChessGame();
  const before = game.getFen();
  const next = game.fenAfterMove('e2', 'e4');
  assert(typeof next === 'string' && next.includes('4P3'), `next FEN=${next}`);
  assert(game.getFen() === before, 'fenAfterMove must not change the live game');
  assert(game.fenAfterMove('e2', 'e5') === null, 'illegal probe returns null');
});

check('getLegalMoves for a starting pawn includes e3 and e4', () => {
  const game = new ChessGame();
  const moves = game.getLegalMoves('e2');
  assert(moves.includes('e3') && moves.includes('e4'), `got ${moves.join(',')}`);
});

const failed = results.filter((r) => !r.pass);
writeFileSync('/tmp/64squares-tests/chess-logic.json', JSON.stringify({ results, failed: failed.length }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
