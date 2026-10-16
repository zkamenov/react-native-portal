const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function loadApi(storage, fetchImpl) {
  const context = {
    exports: {},
    Headers,
    fetch: fetchImpl,
    process,
    require: name => {
      if (name !== '@react-native-async-storage/async-storage') throw new Error(`Unexpected import: ${name}`);
      return { default: storage };
    },
  };
  const compiled = ts.transpileModule(fs.readFileSync(__dirname + '/buildplayApi.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(compiled, context);
  return context.exports;
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Bad Request',
    async json() { return body; },
    async text() { return typeof body === 'string' ? body : JSON.stringify(body); },
  };
}

test('match create, start, join, and move use the documented buildplay.fun requests', async () => {
  const calls = [];
  const match = {
    id: 'server-match',
    game_id: 'sample-game',
    game_version: 1,
    owner_user_id: 'user-1',
    status: 'ongoing',
    end_reason: null,
    players: [{ player_index: 0, kind: 'human', user_id: 'user-1' }],
    turn_of_player_indices: [0],
    state: { board: ['', '', '', '', '', '', '', '', ''] },
    move_count: 0,
  };
  const api = loadApi({}, async (url, options) => {
    calls.push({ url, options });
    return response(match);
  });
  const user = { userId: 'user-1', password: 'secret', displayName: 'Player' };

  await api.createBuildplayMatch('sample-game', user);
  await api.joinBuildplayMatch('server-match', user);
  await api.startBuildplayMatch('server-match', user);
  await api.submitBuildplayMove(match, { cells: [0], player: 0 }, [1], user);
  await api.submitBuildplayMove(match, { cells: [1], player: 1 }, [0, 1], user);

  assert.equal(calls[0].url, 'https://buildplay.fun/matches');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { game_id: 'sample-game' });
  assert.equal(calls[0].options.headers.get('X-User-Id'), user.userId);
  assert.equal(calls[0].options.headers.get('X-User-Password'), user.password);
  assert.equal(calls[1].url, 'https://buildplay.fun/matches/server-match/join');
  assert.equal(calls[2].url, 'https://buildplay.fun/matches/server-match/start');
  assert.deepEqual(JSON.parse(calls[2].options.body), { first_turn_player_indices: [0] });
  assert.equal(calls[3].url, 'https://buildplay.fun/matches/server-match/moves');
  assert.deepEqual(JSON.parse(calls[3].options.body), {
    new_state: { cells: [0], player: 0 },
    next_turn_player_indices: [1],
    expected_move_count: 0,
  });
  assert.deepEqual(JSON.parse(calls[4].options.body), {
    new_state: { cells: [1], player: 1 },
    next_turn_player_indices: [0, 1],
    expected_move_count: 0,
  });
});

test('new anonymous credentials are stored and reused on this device', async () => {
  const values = new Map();
  let userRequests = 0;
  const storage = {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
  };
  const api = loadApi(storage, async () => {
    userRequests += 1;
    return response({ id: 'user-1', password: 'secret', display_name: 'Player One' }, 201);
  });

  const first = await api.getOrCreateBuildplayUser(' Player One ');
  const second = await api.getOrCreateBuildplayUser('ignored');
  assert.deepEqual(JSON.parse(JSON.stringify(first)), {
    userId: 'user-1',
    password: 'secret',
    displayName: 'Player One',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)));
  assert.equal(userRequests, 1);
});

test('API failures are surfaced with their status and response detail', async () => {
  const api = loadApi({}, async () => response({ detail: 'room is full' }, 409));
  await assert.rejects(
    api.getBuildplayMatch('server-match'),
    /buildplay\.fun request failed \(409\): \{"detail":"room is full"\}/,
  );
});

test('catalog and pinned game versions use documented public routes', async () => {
  const calls = [];
  const game = { id: 'sample-game', version: 2, name: 'Sample Game', description: 'Description',
    allowed_player_counts: [2, 4], allows_leave_mid_match: false, allows_join_mid_match: true, code: '<html></html>' };
  const api = loadApi({}, async url => {
    calls.push(url);
    return response(url.endsWith('/games') ? [game, { ...game, id: 'debug', name: 'Debug Game' }] : game);
  });
  assert.equal((await api.listBuildplayGames()).length, 1);
  assert.equal((await api.getBuildplayGameVersion(game.id, game.version)).code, game.code);
  assert.deepEqual(calls, [
    'https://buildplay.fun/games',
    'https://buildplay.fun/games/sample-game/versions/2',
  ]);
});
