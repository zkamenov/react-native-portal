import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GameRunner from '../portal/buildplay/GameRunner';
import { createApi, normalizeServer } from '../portal/buildplay/api';
import { createRepository } from '../portal/buildplay/storage';
import { queueMove, synchronize } from '../portal/buildplay/sync';
import { prepareGame } from '../portal/buildplay/cache';
import { createOfflineMatch, DEVICE_PLAYER, forkLocal } from '../portal/buildplay/local';
import { sampleGame } from '../portal/buildplay/sample';
import { Game, GameSummary, Identity, Move, SavedMatch } from '../portal/buildplay/types';
import GoogleLogin from '../portal/buildplay/GoogleLogin';

const repository=createRepository(AsyncStorage);
const CONNECTION_KEY='gameportal.buildplay.connection.v1';
const DEFAULT_SERVER='https://buildplay.fun';
type Connection={server:string;identity:Identity};
const uniqueId=()=>`local-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
function Button({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={({pressed})=>[styles.button,(disabled||pressed)&&{opacity:0.5}]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}

export default function BuildPlayScreen() {
  const [server,setServer]=useState(DEFAULT_SERVER);
  const [loginServer,setLoginServer]=useState<string|null>(null);
  const [connection,setConnection]=useState<Connection|null>(null);
  const connectionRef=useRef(connection);connectionRef.current=connection;
  const [games,setGames]=useState<GameSummary[]>([]);
  const [library,setLibrary]=useState<GameSummary[]>([]);
  const [saved,setSaved]=useState<SavedMatch[]>([]);
  const savedRef=useRef(saved);
  const [selected,setSelected]=useState<string|null>(null);
  const [code,setCode]=useState<string|null>(null);
  const [notice,setNotice]=useState('Loading saved games…');
  const [busy,setBusy]=useState(false);
  const [ready,setReady]=useState(false);
  const [offline,setOffline]=useState(false);
  const offlineRef=useRef(offline);offlineRef.current=offline;
  const [search,setSearch]=useState('');
  const [matchId,setMatchId]=useState('');
  const [openMatches,setOpenMatches]=useState<Array<{id:string;game_id:string}>>([]);
  const [showConflict,setShowConflict]=useState(false);
  const taskTail=useRef<Promise<unknown>>(Promise.resolve());
  const taskCount=useRef(0);
  const active=saved.find(s=>s.current.id===selected);
  const serverRef=useRef(connection?.server??DEFAULT_SERVER);

  // Serialize mutations and sync checkpoints; never drop a move during refresh.
  function action(task:()=>Promise<void>):Promise<void> {
    taskCount.current++;setBusy(true);
    const result=taskTail.current.then(task);
    taskTail.current=result.catch(error=>{setNotice(String(error));}).finally(()=>{
      taskCount.current--;setBusy(taskCount.current>0);
    });
    return result;
  }
  function run(task:()=>Promise<void>) {void action(task).catch(()=>{});}
  async function put(entry:SavedMatch) {
    const all=savedRef.current;
    const next=all.some(s=>s.current.id===entry.current.id)?all.map(s=>s.current.id===entry.current.id?entry:s):[...all,entry];
    await repository.saveMatches(entry.server,entry.localOnly?DEVICE_PLAYER:entry.userId,
      next.filter(s=>s.server===entry.server&&s.userId===entry.userId&&!!s.localOnly===!!entry.localOnly));
    savedRef.current=next;setSaved(next);
  }
  async function cache(game:Game):Promise<Game> {
    const prepared=await prepareGame(game,serverRef.current);
    await repository.cacheGame(serverRef.current,prepared);
    setLibrary(await repository.library(serverRef.current));return prepared;
  }
  async function getGame(id:string,version:number):Promise<Game> {
    const game=await repository.game(serverRef.current,id,version);
    if(game?.offlineCode)return game;
    if(game)return cache(game);
    if(offlineRef.current)throw new Error('This version is not downloaded. Connect once to save it.');
    return cache(await createApi(serverRef.current,connectionRef.current?.identity).game(id,version));
  }
  async function initialize(c:Connection|null) {
    const target=c?.server??DEFAULT_SERVER;
    const [catalog,cached,local,remote]=await Promise.all([
      repository.catalog(target),repository.library(target),repository.matches(target,DEVICE_PLAYER),
      c?repository.matches(target,c.identity.id):Promise.resolve([]),
    ]);
    savedRef.current=[...local,...remote];setSaved(savedRef.current);setGames(catalog);setLibrary(cached);
    connectionRef.current=c;serverRef.current=target;setConnection(c);setServer(target);setReady(true);
    setNotice('Saved games loaded. Refresh to download games and matches.');
    if(!cached.some(g=>g.id===sampleGame.id))await cache(sampleGame);
  }
  useEffect(()=>{run(async()=>{
    const raw=await AsyncStorage.getItem(CONNECTION_KEY);await initialize(raw?JSON.parse(raw):null);
  });},[]);

  async function refresh() {
    if(offlineRef.current || typeof navigator!=='undefined'&&navigator.onLine===false)return;
    const c=connectionRef.current,api=createApi(serverRef.current,c?.identity);
    const catalog=await api.games();await repository.saveCatalog(serverRef.current,catalog);setGames(catalog);
    const failures:string[]=[];
    if(c) {
      for(const entry of [...savedRef.current].filter(s=>!s.localOnly)) {
        try{await synchronize(entry,api,put);}catch(error){failures.push(`${entry.current.id}: ${String(error)}`);}
      }
      for(const match of await api.matches()) {
        const current=savedRef.current.find(s=>s.current.id===match.id);
        if(current?.pending.length||current?.conflict)continue;
        await put({base:match,current:match,pending:[],userId:c.identity.id,server:c.server});
      }
      for(const entry of savedRef.current.filter(s=>!s.localOnly)) {
        try{await getGame(entry.current.game_id,entry.current.game_version);}catch(error){failures.push(String(error));}
      }
    }
    setNotice(failures.length?`Local saves kept. ${failures.length} items need attention: ${failures.join('; ')}`:
      c?'Matches synchronized and game versions downloaded.':'Catalog refreshed. Download a game to play offline.');
  }
  useEffect(()=>{
    if(!ready)return;
    const retry=()=>{if(!offlineRef.current&&taskCount.current===0)run(refresh);};
    const timer=setInterval(retry,5000);
    const app=AppState.addEventListener('change',state=>{if(state==='active')retry();});
    const browser=typeof window!=='undefined'?window:null;browser?.addEventListener?.('online',retry);
    const lost=()=>{offlineRef.current=true;setOffline(true);setNotice('You are offline. Downloaded games and device saves are available.');};
    const restored=()=>{offlineRef.current=false;setOffline(false);retry();};
    browser?.addEventListener?.('offline',lost);browser?.addEventListener?.('online',restored);
    if(typeof navigator!=='undefined'&&navigator.onLine===false)lost();
    return()=>{clearInterval(timer);app.remove();browser?.removeEventListener?.('online',retry);
      browser?.removeEventListener?.('offline',lost);browser?.removeEventListener?.('online',restored);};
  },[ready,connection]);

  async function open(entry:SavedMatch) {
    if(entry.current.status==='waiting_for_players')throw new Error('Waiting for players. Start the match online when ready.');
    const game=await getGame(entry.current.game_id,entry.current.game_version);
    setCode(game.offlineCode!);setSelected(entry.current.id);setShowConflict(false);
    setNotice(entry.localOnly?'Private offline game. Progress saves on this device.':'Moves save locally first and synchronize when connected.');
  }
  async function startLocal(game:GameSummary) {
    await getGame(game.id,game.version);
    const entry=createOfflineMatch(game,serverRef.current,uniqueId());await put(entry);await open(entry);
  }
  async function onMove(move:Move) {
    if(!active)return;
    const match=active.current;
    await action(async()=>{
      const entry=savedRef.current.find(s=>s.current.id===match.id)!;
      if(entry.current.move_count!==match.move_count)throw new Error('The match updated. Please try your move again.');
      await put(queueMove(entry,move));setNotice(entry.localOnly?'Progress saved on this device.':'Move saved; waiting to synchronize.');
    });
  }
  async function startOnline(game:GameSummary,lobby=false) {
    const c=connectionRef.current;if(!c)throw new Error('Sign in to create a synchronized match.');
    await getGame(game.id,game.version);
    const api=createApi(c.server,c.identity);
    const created=await api.createMatch(game.id,lobby?0:Math.min(...game.allowed_player_counts)-1);
    let entry:SavedMatch={base:created,current:created,pending:[],userId:c.identity.id,server:c.server};
    await put(entry); // Preserve the lobby even if start fails.
    if(lobby){setNotice(`Lobby created. Share match ID: ${created.id}`);return;}
    const started=await api.start(created.id);entry={...entry,base:started,current:started};await put(entry);await open(entry);
  }
  async function join(id:string) {
    const c=connectionRef.current;if(!c||!id.trim())throw new Error('Sign in and enter a match ID.');
    const match=await createApi(c.server,c.identity).join(id.trim());
    await put({base:match,current:match,pending:[],server:c.server,userId:c.identity.id});
    await getGame(match.game_id,match.game_version);setNotice('Joined. The owner can start when all players are ready.');
  }
  async function resolveConflict(entry:SavedMatch) {
    const c=connectionRef.current;if(!c||offlineRef.current)throw new Error('Connect to review the latest server state.');
    const remote=await createApi(c.server,c.identity).match(entry.current.id);
    await put(forkLocal(entry,uniqueId()));
    await put({...entry,base:remote,current:remote,pending:[],conflict:undefined,remote:undefined});
    setNotice('Local progress preserved as a private copy. Original match now follows the server.');setShowConflict(false);
  }

  if(active&&code!==null)return <View style={{flex:1,gap:8,paddingHorizontal:12}}>
    <View style={styles.row}><Button label="Back to games" onPress={()=>{setSelected(null);setCode(null);}} />
      <Button label={offline?'Go online':'Work offline'} onPress={()=>setOffline(v=>!v)} /></View>
    <Text accessibilityLiveRegion="polite">{notice}</Text>
    <Text>{active.localOnly?'Private save':`${active.pending.length} queued moves`} · Move {active.current.move_count} · {active.current.status}</Text>
    {active.conflict&&<><Text style={styles.error}>{active.conflict}</Text>
      <Button label={showConflict?'Hide conflict details':'Review conflict'} onPress={()=>setShowConflict(v=>!v)} />
      {showConflict&&<ScrollView style={{maxHeight:200}}><Text selectable>Local state: {JSON.stringify(active.current.state)}</Text>
        <Text selectable>Last server state: {JSON.stringify(active.remote?.state??active.base.state)}</Text>
        <Button label="Keep private copy and follow server" disabled={busy||offline} onPress={()=>run(()=>resolveConflict(active))} /></ScrollView>}
    </>}
    <GameRunner key={active.current.id} code={code} match={active.current} userId={active.userId} onMove={onMove} onError={setNotice} />
  </View>;

  const query=search.trim().toLowerCase(),shown=library.filter(g=>g.name.toLowerCase().includes(query));
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Text style={styles.title}>BuildPlay games</Text><Text accessibilityLiveRegion="polite">{notice}</Text>
    <View style={styles.row}><Button label={busy?'Saving / connecting…':'Refresh & synchronize'} disabled={busy||offline||!ready} onPress={()=>run(refresh)} />
      <Button label={offline?'Go online':'Work offline'} onPress={()=>setOffline(v=>!v)} /></View>
    <Text>Offline mode keeps your games on this device. Multiplayer moves wait for a connection and your own turn.</Text>
    <TextInput accessibilityLabel="Search downloaded games" placeholder="Search games" style={styles.input} value={search} onChangeText={setSearch} />
    <Text style={styles.heading}>Downloaded games</Text>
    {shown.map(game=><View style={styles.card} key={`${game.id}@${game.version}`}><Text style={styles.gameName}>{game.name}</Text>
      <Text>Version {game.version} · Available offline</Text><Button label="New offline solo / vs computer" disabled={busy||!ready} onPress={()=>run(()=>startLocal(game))} /></View>)}
    {!shown.length&&<Text>No downloaded games match this search.</Text>}
    <Text style={styles.heading}>Saved BuildPlay matches</Text>
    {saved.map(entry=><View style={styles.card} key={entry.current.id}>
      <Text style={styles.gameName}>{[...library,...games].find(g=>g.id===entry.current.game_id)?.name??entry.current.game_id}</Text>
      <Text selectable>Match ID: {entry.current.id}</Text><Text>{entry.current.status} · {entry.localOnly?'Private offline save':`${entry.pending.length} queued moves`}</Text>
      {entry.conflict&&<Text style={styles.error}>Sync conflict — local progress preserved</Text>}
      {entry.current.status==='waiting_for_players'?<><Text>{entry.current.players.length} players in lobby</Text>
        {connection?.identity.id===entry.current.owner_user_id&&<Button label="Start match" disabled={busy||offline} onPress={()=>run(async()=>{
          const started=await createApi(connection.server,connection.identity).start(entry.current.id);
          const updated={...entry,base:started,current:started};await put(updated);await open(updated);
        })} />}</>:<Button label="Resume saved match" disabled={busy} onPress={()=>run(()=>open(entry))} />}
    </View>)}
    {!saved.length&&<Text>No saved matches yet. Start a downloaded game above.</Text>}
    <Text style={styles.heading}>Games on BuildPlay</Text>
    {games.filter(g=>g.name.toLowerCase().includes(query)).map(game=><View style={styles.card} key={game.id}>
      <Text style={styles.gameName}>{game.name}</Text><Text>{game.description}</Text>
      <Button label="Download for offline play" disabled={busy||offline} onPress={()=>run(async()=>{
        await getGame(game.id,game.version);setNotice(`${game.name} downloaded.`);
      })} />
      {connection&&<View style={styles.row}><Button label="Synced solo / vs computer" disabled={busy||offline} onPress={()=>run(()=>startOnline(game))} />
        <Button label="Create multiplayer lobby" disabled={busy||offline} onPress={()=>run(()=>startOnline(game,true))} /></View>}
    </View>)}
    <Text style={styles.heading}>Account & online multiplayer</Text>
    {connection?<><Text>Signed in: {connection.identity.id}</Text>
      <TextInput accessibilityLabel="Match ID to join" style={styles.input} placeholder="Match ID to join" value={matchId} onChangeText={setMatchId} autoCapitalize="none" />
      <Button label="Join match" disabled={busy||offline} onPress={()=>run(()=>join(matchId))} />
      <Button label="Find open matches" disabled={busy||offline} onPress={()=>run(async()=>setOpenMatches(await createApi(connection.server,connection.identity).openMatches()))} />
      {openMatches.map(m=><Button key={m.id} label={`Join ${m.game_id} · ${m.id}`} disabled={busy||offline} onPress={()=>run(()=>join(m.id))} />)}
      <Button label="Sign out (keep device saves)" disabled={busy} onPress={()=>run(async()=>{
        await AsyncStorage.removeItem(CONNECTION_KEY);setLoginServer(null);await initialize(null);
      })} />
    </>:<><Text>Google login is only needed for synchronized matches. The course OAuth administrator must allow this website's address.</Text>
      <TextInput style={styles.input} accessibilityLabel="BuildPlay server URL" value={server} onChangeText={setServer} autoCapitalize="none" />
      <Button label="Continue with Google" disabled={offline||busy||!ready} onPress={()=>{try{setLoginServer(normalizeServer(server));}catch(error){setNotice(String(error));}}} />
      {loginServer&&<GoogleLogin server={loginServer} onSuccess={async auth=>{
        await action(async()=>{const c={server:loginServer,identity:{id:auth.user_id,password:auth.password}};
          await initialize(c);await AsyncStorage.setItem(CONNECTION_KEY,JSON.stringify(c));});run(refresh);
      }} />}
    </>}
  </ScrollView>;
}
const styles=StyleSheet.create({
  content:{padding:16,gap:14,width:'100%',maxWidth:900,alignSelf:'center',paddingBottom:48},
  title:{fontSize:28,fontWeight:'700',color:'#172033'},heading:{fontSize:21,fontWeight:'700',marginTop:12},
  gameName:{fontSize:18,fontWeight:'600'},card:{padding:16,gap:10,borderWidth:1,borderColor:'#cbd5e1',borderRadius:12,backgroundColor:'#fff'},
  row:{flexDirection:'row',flexWrap:'wrap',gap:10},button:{padding:14,minHeight:48,backgroundColor:'#e8efff',borderRadius:10,justifyContent:'center'},
  buttonText:{color:'#1e3a8a',fontWeight:'600',fontSize:15},input:{padding:12,minHeight:48,borderWidth:1,borderColor:'#cbd5e1',borderRadius:8},error:{color:'#9a3412'},
});
