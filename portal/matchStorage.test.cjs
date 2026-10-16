const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, imports = {}) {
  const context = { exports: {}, require: name => {
    if (!(name in imports)) throw new Error('Unexpected import: ' + name);
    return imports[name];
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.exports;
}
const rules = load(__dirname + '/../games/ticTacToe.ts');
const model = load(__dirname + '/matches.ts', {'../games/ticTacToe': rules});
const service = load(__dirname + '/matchStorage.ts', {
  '../games/ticTacToe': rules,
  '@react-native-async-storage/async-storage': { default: {} },
});
const {createMatch, moveInMatch} = model;
const {createMatchStorage, decodeMatches, nextMatchId, MATCH_STORAGE_KEY} = service;
const plain = value => JSON.parse(JSON.stringify(value));
function memoryStorage() {
  let raw = null;
  return {
    async getItem(key) { assert.equal(key, MATCH_STORAGE_KEY); return raw; },
    async setItem(key, value) { assert.equal(key, MATCH_STORAGE_KEY); raw = value; },
  };
}

test('empty storage restores no matches and starts ids at 1', async () => {
  const restored = await createMatchStorage(memoryStorage()).load();
  assert.equal(restored.length, 0);
  assert.equal(nextMatchId(restored), 1);
});

test('reload restores active and finished records without duplicates or id changes', async () => {
  const storage = memoryStorage();
  let matches = [createMatch('1'), createMatch('2')];
  matches = moveInMatch(moveInMatch(matches, '1', 0), '1', 3);
  for (const index of [0,3,1,4,2]) matches = moveInMatch(matches, '2', index);
  await createMatchStorage(storage).save(matches);
  const restored = await createMatchStorage(storage).load();
  assert.deepEqual(plain(restored), plain(matches));
  assert.equal(restored.length, 2);
  assert.equal(restored[0].status, 'active');
  assert.equal(restored[0].currentTurn, 'X');
  assert.equal(restored[1].status, 'finished');
  assert.equal(restored[1].result, 'X');
  assert.equal(moveInMatch(restored, '2', 8)[1], restored[1]);
  const resumed = moveInMatch(restored, '1', 1);
  assert.equal(resumed[0].board[1], 'X');
  assert.equal(nextMatchId(restored), 3);
  const replay = [...restored, createMatch(String(nextMatchId(restored)))];
  await createMatchStorage(storage).save(replay);
  assert.equal((await createMatchStorage(storage).load()).length, 3);
});

test('computer matches retain their mode and progress after reload', async () => {
  const storage = memoryStorage();
  const matches = moveInMatch([createMatch('5', 'computer')], '5', 0);
  await createMatchStorage(storage).save(matches);
  const restored = await createMatchStorage(storage).load();
  assert.equal(restored[0].mode, 'computer');
  assert.equal(restored[0].board[0], 'X');
  assert.equal(restored[0].currentTurn, 'O');
});

test('O wins and draws retain their finished result across reload', async () => {
  for (const [moves, result] of [
    [[0,3,1,4,8,5], 'O'], [[0,1,2,4,3,5,7,6,8], 'draw'],
  ]) {
    const storage = memoryStorage();
    let matches = [createMatch('7')];
    for (const index of moves) matches = moveInMatch(matches, '7', index);
    const repository = createMatchStorage(storage);
    await repository.save(matches);
    const restored = await repository.load();
    assert.equal(restored[0].result, result);
    assert.equal(restored[0].status, 'finished');
    assert.equal(restored[0].currentTurn, null);
    assert.equal(nextMatchId(restored), 8);
  }
});

test('online match snapshots are stored and restored for offline viewing', async () => {
  const storage = memoryStorage();
  const online = {
    ...createMatch('4'),
    source: 'online',
    serverMatchId: 'buildplay-match-123',
    playerIndex: 1,
  };
  online.board = ['X', null, null, null, 'O', null, null, null, null];
  online.currentTurn = 'X';
  const repository = createMatchStorage(storage);
  await repository.save([online]);
  const restored = await repository.load();
  assert.deepEqual(plain(restored), plain([online]));
  assert.equal(restored[0].serverMatchId, online.serverMatchId);
  assert.equal(restored[0].source, 'online');
  assert.equal(restored[0].board[4], 'O');
});

test('non-Tic-Tac-Toe online snapshots keep their hosted game and full state offline', async () => {
  const storage = memoryStorage();
  const online = {
    ...createMatch('8'),
    gameName: 'Gomoku',
    source: 'online',
    serverMatchId: 'gomoku-match',
    playerIndex: 0,
    gameId: 'gomoku-game',
    gameVersion: 3,
    gameCode: '<!doctype html><html><body>Gomoku</body></html>',
    serverStatus: 'ongoing',
    onlineState: {
      id: 'gomoku-match',
      game_id: 'gomoku-game',
      game_version: 3,
      owner_user_id: 'user-1',
      status: 'ongoing',
      end_reason: null,
      players: [{ player_index: 0, kind: 'human', user_id: 'user-1' }],
      turn_of_player_indices: [0],
      state: { board: Array(225).fill(0), last: 112 },
      move_count: 1,
    },
  };
  online.board = Array(9).fill(null);
  online.currentTurn = null;
  online.result = null;
  const repository = createMatchStorage(storage);
  await repository.save([online]);
  const restored = await repository.load();
  assert.deepEqual(plain(restored), plain([online]));
  assert.equal(restored[0].gameName, 'Gomoku');
  assert.equal(restored[0].gameCode, online.gameCode);
  assert.equal(restored[0].onlineState.state.board.length, 225);
});

test('queued writes cannot overwrite a newer snapshot with an older one', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const snapshots = [];
  const repository = createMatchStorage({
    async getItem() { return snapshots.at(-1) ?? null; },
    async setItem(key, value) {
      if (snapshots.length === 0) await gate;
      snapshots.push(value);
    },
  });
  const original = [createMatch('1')];
  const newer = moveInMatch(original, '1', 0);
  const first = repository.save(original);
  const second = repository.save(newer);
  release();
  await Promise.all([first, second]);
  assert.equal(snapshots.length, 2);
  assert.equal((await repository.load())[0].board[0], 'X');
});

test('write failures are reported and do not poison later saves', async () => {
  let fail = true;
  let raw;
  const repository = createMatchStorage({
    async getItem() { return raw; },
    async setItem(key, value) {
      if (fail) { fail = false; throw new Error('storage unavailable'); }
      raw = value;
    },
  });
  await assert.rejects(repository.save([createMatch('1')]), /storage unavailable/);
  await repository.save([createMatch('2')]);
  assert.equal((await repository.load())[0].id, '2');
});

test('load errors and invalid saved data are reported rather than silently erased', async () => {
  const repository = createMatchStorage({
    async getItem() { throw new Error('read failed'); },
    async setItem() { assert.fail('load must not write'); },
  });
  await assert.rejects(repository.load(), /read failed/);
  for (const raw of ['{', 'null', '{"version":4,"matches":[]}',
    JSON.stringify({version:1,matches:[createMatch('1'),createMatch('1')]}),
    JSON.stringify({version:1,matches:[{...createMatch('1'),board:[]}]}),
    JSON.stringify({version:1,matches:[{...createMatch('1'),currentTurn:'O'}]}),
  ]) assert.throws(() => decodeMatches(raw));
});

test('new ids use the highest saved id regardless of list order', () => {
  assert.equal(nextMatchId([createMatch('12'),createMatch('2')]), 13);
});
