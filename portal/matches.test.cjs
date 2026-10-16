const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, requireModule) {
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = { exports: {}, require: requireModule };
  vm.runInNewContext(compiled, context);
  return context.exports;
}
const rules = load(__dirname + '/../games/ticTacToe.ts');
const { createMatch, moveInMatch, matchStatusLabel } = load(__dirname + '/matches.ts', () => rules);
const play = (matches, id, moves) => moves.reduce((current, index) => moveInMatch(current, id, index), matches);

test('new matches have independent boards, ids, and active X status', () => {
  const first = createMatch('1');
  const second = createMatch('2');
  assert.equal(first.id, '1');
  assert.equal(second.id, '2');
  assert.equal(first.gameName, 'Tic-Tac-Toe');
  assert.equal(first.status, 'active');
  assert.equal(first.currentTurn, 'X');
  assert.equal(first.result, null);
  assert.ok(first.board.every(square => square === null));
  assert.notEqual(first.board, second.board);
  assert.equal(matchStatusLabel(first), "Player X's turn");
});

test('computer mode is stored on its match while retaining normal move rules', () => {
  const match = createMatch('3', 'computer');
  assert.equal(match.mode, 'computer');
  assert.equal(createMatch('4').mode, undefined);
  const afterHumanMove = moveInMatch([match], '3', 0);
  const computerMove = rules.chooseComputerMove(afterHumanMove[0].board);
  const moved = moveInMatch(afterHumanMove, '3', computerMove);
  assert.equal(moved[0].mode, 'computer');
  assert.equal(moved[0].board[computerMove], 'O');
  assert.equal(moved[0].currentTurn, 'X');
});

test('leaving and reopening keeps the board and turn in the match collection', () => {
  const original = [createMatch('1'), createMatch('2')];
  const updated = play(original, '1', [0, 3]);
  const reopened = updated.find(match => match.id === '1');
  assert.equal(reopened.board[0], 'X');
  assert.equal(reopened.board[3], 'O');
  assert.equal(reopened.currentTurn, 'X');
  assert.equal(reopened.status, 'active');
  assert.equal(original[0].board[0], null);
  assert.equal(updated[1], original[1]);
  const resumed = moveInMatch(updated, reopened.id, 1);
  assert.equal(resumed[0].currentTurn, 'O');
  assert.equal(matchStatusLabel(resumed[0]), "Player O's turn");
});

test('X wins, O wins, and draws move matches from active to finished', () => {
  for (const [moves, result, label] of [
    [[0,3,1,4,2], 'X', 'X won'],
    [[0,3,1,4,8,5], 'O', 'O won'],
    [[0,1,2,4,3,5,7,6,8], 'draw', 'Draw'],
  ]) {
    const matches = play([createMatch('1')], '1', moves);
    assert.equal(matches.filter(match => match.status === 'active').length, 0);
    assert.equal(matches.filter(match => match.status === 'finished').length, 1);
    assert.equal(matches[0].result, result);
    assert.equal(matches[0].currentTurn, null);
    assert.equal(matchStatusLabel(matches[0]), label);
    for (let index = 0; index < 9; index++) {
      assert.equal(moveInMatch(matches, '1', index)[0], matches[0]);
    }
  }
});

test('Play Again adds a fresh record without overwriting the old match', () => {
  const finished = play([createMatch('1')], '1', [0,3,1,4,2])[0];
  const matches = [finished, createMatch('2')];
  const updated = moveInMatch(matches, '2', 8);
  assert.equal(updated[0], finished);
  assert.equal(updated[0].result, 'X');
  assert.equal(updated[1].board[8], 'X');
  assert.equal(updated[1].status, 'active');
});

test('invalid, occupied, and unknown-match moves leave records untouched', () => {
  const matches = moveInMatch([createMatch('1')], '1', 0);
  for (const index of [0, -1, 9, 0.5]) {
    assert.equal(moveInMatch(matches, '1', index)[0], matches[0]);
  }
  assert.equal(moveInMatch(matches, 'missing', 1)[0], matches[0]);
});
