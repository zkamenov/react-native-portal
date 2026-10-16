import { GameSummary, SavedMatch } from './types';
export const DEVICE_PLAYER = 'device-player';
export function createOfflineMatch(game: GameSummary, server: string, id: string): SavedMatch {
  const count = Math.min(...game.allowed_player_counts);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid allowed player counts');
  const now = new Date().toISOString();
  const current = {
    id, game_id:game.id, game_version:game.version, owner_user_id:DEVICE_PLAYER,
    status:'ongoing' as const, end_reason:null, state:null, move_count:0,
    turn_of_player_indices:[0], created_at:now, updated_at:now,
    players:Array.from({length:count}, (_, index) => ({player_index:index,
      kind:index === 0 ? 'human' as const : 'computer' as const, user_id:index === 0 ? DEVICE_PLAYER : null})),
  };
  return {base:current,current,pending:[],server,userId:DEVICE_PLAYER,localOnly:true};
}
export function forkLocal(saved: SavedMatch, id: string): SavedMatch {
  // A fork is explicitly private, never uploaded as an overwrite of the live match.
  const current = {...saved.current,id,owner_user_id:DEVICE_PLAYER,
    players:saved.current.players.map(p => ({...p,kind:p.user_id===saved.userId?'human' as const:'computer' as const,
      user_id:p.user_id===saved.userId?DEVICE_PLAYER:null}))};
  return {base:current,current,pending:[],server:saved.server,userId:DEVICE_PLAYER,localOnly:true};
}
