const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(__dirname + '/buildplayGameProtocol.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, context);
const { createGameStateMessage, getNextTurnPlayerIndices } = context.exports;

test('hosted games receive the server state and platform turn/player fields', () => {
  const match = {
    id: 'match-1',
    game_id: 'gomoku',
    game_version: 1,
    owner_user_id: 'user-1',
    status: 'ongoing',
    end_reason: null,
    players: [
      { player_index: 0, kind: 'human', user_id: 'user-1' },
      { player_index: 1, kind: 'human', user_id: 'user-2' },
    ],
    turn_of_player_indices: [1],
    state: { board: [0, 1], winner: null },
    move_count: 2,
  };
  const forCurrentPlayer = createGameStateMessage(match, 1);
  assert.equal(forCurrentPlayer.type, 'state_changed');
  assert.equal(forCurrentPlayer.my_player_index, 1);
  assert.equal(forCurrentPlayer.turn_of_player_index, 1);
  assert.equal(forCurrentPlayer.acting_for_player_index, 1);
  assert.equal(forCurrentPlayer.players[0].name, 'Player 1');
  assert.deepEqual(JSON.parse(JSON.stringify(forCurrentPlayer.state)), match.state);

  const forOpponent = createGameStateMessage(match, 0);
  assert.equal(forOpponent.acting_for_player_index, null);
});

test('waiting games receive the next supported seat and multi-player turns', () => {
  const match = {
    id: 'match-2',
    game_id: 'battleship',
    game_version: 8,
    owner_user_id: 'user-1',
    status: 'waiting_for_players',
    end_reason: null,
    players: [{ player_index: 0, kind: 'human', user_id: 'user-1' }],
    turn_of_player_indices: null,
    state: null,
    move_count: 0,
  };
  const state = createGameStateMessage(match, 0, [2]);
  assert.equal(state.players.length, 2);
  assert.equal(state.players[1].name, 'Waiting for player 2');
  assert.equal(state.players[1].kind, 'human');
  assert.equal(state.turn_of_player_index, null);
  assert.equal(state.acting_for_player_index, null);

  const simultaneousMatch = {
    ...match,
    status: 'ongoing',
    players: [
      { player_index: 0, kind: 'human', user_id: 'user-1' },
      { player_index: 1, kind: 'human', user_id: 'user-2' },
    ],
    turn_of_player_indices: [0, 1],
  };
  const simultaneousState = createGameStateMessage(simultaneousMatch, 1, [2]);
  assert.deepEqual(JSON.parse(JSON.stringify(simultaneousState.turn_of_player_indices)), [0, 1]);
  assert.equal(simultaneousState.acting_for_player_index, 1);
});

test('move messages preserve plural turn lists and accept the legacy singular field', () => {
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(getNextTurnPlayerIndices({
    next_turn_player_indices: [0, 2],
  }, 3)), [0, 2]);
  assert.deepEqual(plain(getNextTurnPlayerIndices({
    next_turn_player_indices: null,
  }, 3)), null);
  assert.deepEqual(plain(getNextTurnPlayerIndices({
    next_turn_player_index: 1,
  }, 3)), [1]);
  assert.throws(() => getNextTurnPlayerIndices({ next_turn_player_indices: [3] }, 3), /invalid/);
  assert.throws(() => getNextTurnPlayerIndices({}, 3), /did not provide/);
});
