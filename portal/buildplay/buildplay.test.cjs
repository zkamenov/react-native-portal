const {test} = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function load(file, imports = {}, globals = {}) {
  const context = { ...globals, exports: {}, require: name => {
    if (!(name in imports)) throw Error(name);
    return imports[name];
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(__dirname + '/' + file + '.ts', 'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, context);
  return context.exports;
}
const protocol = load('protocol');
const {queueMove, synchronize} = load('sync', {'./protocol': protocol});
const {createRepository} = load('storage');
const match = () => ({id:'m', game_id:'g', game_version:2, owner_user_id:'u', status:'ongoing',
  end_reason:null, players:[{player_index:0,kind:'computer',user_id:null},{player_index:1,kind:'human',user_id:'u'}],
  turn_of_player_indices:[1], state:{board:[]}, move_count:0, created_at:'', updated_at:''});
const saved = () => ({base:match(), current:match(), pending:[],userId:'u',server:'https://example.invalid'});
const move = {new_state:{board:['X']},next_turn_player_indices:[0]};
const {createOfflineMatch,forkLocal,DEVICE_PLAYER}=load('local');
const {prepareGame}=load('cache',{}, {URL,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout});
test('cached games create fresh private offline sessions and keep moves after reload', async()=>{
  const game={id:'g',version:2,allowed_player_counts:[2]};
  const original=createOfflineMatch(game,'s','private');
  const changed=queueMove(original,move);
  assert.equal(changed.pending.length,0);
  assert.equal(changed.current.players[0].user_id,DEVICE_PLAYER);
  const raw=JSON.stringify(changed);
  assert.equal(JSON.parse(raw).current.state.board[0],'X');
  const result=await synchronize(changed,{match:async()=>assert.fail('private saves never contact server')},async()=>assert.fail());
  assert.equal(result,changed);
});
test('conflict fork preserves the actual viewer seat and makes opponents computers',()=>{
  const local=queueMove(saved(),move);
  const fork=forkLocal(local,'fork');
  assert.equal(fork.current.players[1].user_id,DEVICE_PLAYER);
  assert.equal(fork.current.players[0].kind,'computer');
  assert.equal(fork.current.move_count,1);
  assert.equal(fork.pending.length,0);
  assert.equal(local.current.id,'m');
});
test('static HTML CSS JS and image assets are embedded into the cached document',async()=>{
  const calls=[];
  const files={
    'https://host.test/game.js':{mime:'application/javascript',bytes:new TextEncoder().encode('window.answer=42;')},
    'https://host.test/style.css':{mime:'text/css',bytes:new TextEncoder().encode('body{background:url("/tile.png")}')},
    'https://host.test/tile.png':{mime:'image/png',bytes:new Uint8Array([1,2,3])},
  };
  const game={id:'g',version:1,code:'<link rel="stylesheet" href="/style.css"><script src="/game.js"></script><img src="/tile.png">'};
  const cached=await prepareGame(game,'https://host.test',async url=>{calls.push(url);return files[url]});
  assert.match(cached.offlineCode,/window.answer=42/);
  assert.match(cached.offlineCode,/data:image\/png;base64,AQID/);
  assert.equal(calls.length,3);
  assert.equal(cached.code,game.code);
});
test('asset download failure and unsupported dynamic network code are not marked offline ready',async()=>{
  await assert.rejects(prepareGame({code:'<img src="/broken.png">'},'https://host.test',async()=>{throw Error('offline')}),/offline/);
  await assert.rejects(prepareGame({code:'<script>fetch("/data")</script>'},'https://host.test'),/self-contained/);
});
test('official course sample is a self-contained cacheable game',async()=>{
  const {sampleGame}=load('sample');
  const cached=await prepareGame(sampleGame,'https://buildplay.fun',async()=>assert.fail('sample must be self-contained'));
  assert.match(cached.offlineCode,/state_changed/);
  assert.match(cached.offlineCode,/make_move/);
});
test('concurrent cache writes preserve the index of every game version',async()=>{
  const data=new Map();
  const repo=createRepository({getItem:async k=>data.get(k)??null,setItem:async(k,v)=>data.set(k,v)});
  await Promise.all([repo.cacheGame('s',{id:'a',version:1,code:'A'}),repo.cacheGame('s',{id:'b',version:1,code:'B'})]);
  assert.equal((await repo.library('s')).length,2);
});
test('lost move response reconciles attributed server history without submitting twice',async()=>{
  const local=queueMove(saved(),move);
  const remote=protocol.applyMove(match(),'u',move);
  let checkpoints=0;
  const result=await synchronize(local,{match:async()=>remote,
    history:async()=>[{...move,move_number:1,made_by_user_id:'u',player_index:1}],
    move:async()=>assert.fail('move already on server')},async()=>{checkpoints++});
  assert.equal(result.pending.length,0);assert.equal(result.conflict,undefined);assert.equal(checkpoints,1);
});
test('matching state made by another user is a conflict, never silently acknowledged',async()=>{
  const local=queueMove(saved(),move),remote=protocol.applyMove(match(),'u',move);
  const result=await synchronize(local,{match:async()=>remote,
    history:async()=>[{...move,move_number:1,made_by_user_id:'other',player_index:1}],move:async()=>assert.fail()},async()=>{});
  assert.ok(result.conflict);assert.equal(result.pending.length,1);
});
test('non JSON move payloads are rejected before saves',()=>{
  for(const value of [undefined,NaN,Infinity,{x:undefined},()=>1,new Date()]) {
    assert.throws(()=>protocol.parseMove({type:'make_move',new_state:value,next_turn_player_indices:null}));
  }
});
test('Google login follows the real auth endpoints and does not link an existing account', async () => {
  const requests=[];
  const {createApi}=load('api', {}, {URL,AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{
    requests.push({url,options});
    return {ok:true,json:async()=>url.endsWith('/config')?{google_client_id:'course-client'}:
      {user_id:'google-user',password:'platform-credential',display_name:'Player'}};
  }});
  const api=createApi('https://buildplay.fun');
  assert.equal((await api.authConfig()).google_client_id,'course-client');
  const auth=await api.googleLogin('test-id-token');
  assert.equal(auth.user_id,'google-user');
  assert.equal(requests[0].url,'https://buildplay.fun/auth/config');
  assert.equal(requests[1].url,'https://buildplay.fun/auth/google');
  assert.equal(requests[1].options.method,'POST');
  assert.equal(JSON.parse(requests[1].options.body).id_token,'test-id-token');
  assert.equal(requests[1].options.headers['X-User-Id'],undefined);
  assert.equal(requests[1].options.headers['X-User-Password'],undefined);
});
test('viewer identity follows the actual seat, including computer turns', () => {
  assert.equal(protocol.stateChanged(match(),'u').my_player_index,1);
  assert.equal(protocol.actingFor(match(),'u'),1);
  assert.equal(protocol.actingFor({...match(),turn_of_player_indices:[0]},'u'),0);
  assert.equal(protocol.actingFor(match(),'spectator'),null);
  assert.throws(() => protocol.parseMove({type:'make_move',new_state:{},next_turn_player_indices:[]}));
});
test('HTML cache and queued moves survive repository recreation and use separate keys', async () => {
  const data = new Map();
  const storage = {getItem:async k=>data.get(k)??null,setItem:async(k,v)=>data.set(k,v)};
  const repository = createRepository(storage);
  const game = {id:'g',version:2,code:'<style>body{color:red}</style><script>play()</script>'};
  await repository.cacheGame('s',game);
  await repository.saveMatches('s','u',[queueMove(saved(),move)]);
  const restored = createRepository(storage);
  assert.equal((await restored.game('s','g',2)).code,game.code);
  assert.equal((await restored.matches('s','u'))[0].pending.length,1);
  assert.equal((await restored.matches('other','u')).length,0);
  assert.equal([...data.keys()].includes('gameportal.local-matches.v1'),false);
});
test('changed remote state pauses synchronization without losing queued moves', async () => {
  const local = queueMove(saved(),move);
  let persisted;
  const result = await synchronize(local,{match:async()=>({...match(),state:{changed:true}}),move:async()=>assert.fail('must not submit')},async s=>{persisted=s});
  assert.ok(result.conflict); assert.equal(persisted.pending.length,1);
  assert.equal(result.current.state.board[0],'X');
});
test('network failure retains queue, successful sync uses expected move count', async () => {
  const local = queueMove(saved(),move);
  await assert.rejects(synchronize(local,{match:async()=>{throw Error('offline')}},async()=>assert.fail()),/offline/);
  assert.equal(local.pending.length,1);
  const checkpoints=[];
  const result = await synchronize(local,{match:async()=>match(),move:async(id,m,count)=>{
    assert.equal(count,0); return protocol.applyMove(match(),'u',m);
  }},async s=>{checkpoints.push(s)});
  assert.equal(result.pending.length,0); assert.equal(checkpoints.length,1);
  assert.equal(result.base.move_count,1);
});
test('storage failures do not poison subsequent queued writes', async () => {
  let fail=true; let raw=null;
  const repository=createRepository({getItem:async()=>raw,setItem:async(k,v)=>{if(fail){fail=false;throw Error('disk')} raw=v;}});
  await assert.rejects(repository.saveMatches('s','u',[saved()]),/disk/);
  await repository.saveMatches('s','u',[queueMove(saved(),move)]);
  assert.equal((await repository.matches('s','u'))[0].pending.length,1);
});
