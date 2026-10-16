import { Match, Move, SavedMatch } from './types';
import { actingFor, applyMove, sameBaseline } from './protocol';

export function queueMove(saved: SavedMatch, move: Move): SavedMatch {
  if (saved.conflict) throw new Error('Resolve the synchronization conflict before making more moves');
  const current = applyMove(saved.current, saved.userId, move);
  return saved.localOnly ? {...saved,base:current,current,pending:[]} :
    { ...saved, current, pending: [...saved.pending, move] };
}

type Remote = { match(id: string): Promise<Match>; move(id: string, move: Move, count: number): Promise<Match>;
  history?(id:string):Promise<Array<Move & {move_number:number;made_by_user_id:string;player_index:number}>> };
export async function synchronize(saved: SavedMatch, api: Remote, persist: (s: SavedMatch) => Promise<void>): Promise<SavedMatch> {
  if (saved.conflict || saved.localOnly) return saved;
  let current = saved;
  // A failed request must leave both the baseline and the durable queue intact.
  const remote = await api.match(saved.base.id);
  if (!saved.pending.length) {
    current = { ...saved, base: remote, current: remote };
    await persist(current);
    return current;
  }
  if (!sameBaseline(current.base, remote) && api.history && remote.move_count > saved.base.move_count) {
    // A response can be lost after the server accepts a move. Reconcile only
    // history entries attributed to this user and exactly matching the queue.
    const history=await api.history(saved.base.id);
    let base=saved.base;
    const pending=[...saved.pending];
    while(pending.length && base.move_count<remote.move_count) {
      const item=history.find(m=>m.move_number===base.move_count+1);
      if(!item||item.made_by_user_id!==saved.userId||item.player_index!==actingFor(base,saved.userId))break;
      const optimistic=applyMove(base,saved.userId,pending[0]);
      const historical=applyMove(base,saved.userId,item);
      if(!sameBaseline(optimistic,historical))break;
      base=historical;pending.shift();
    }
    if(sameBaseline(base,remote)) {
      let optimistic=remote;
      for(const item of pending)optimistic=applyMove(optimistic,saved.userId,item);
      current={...saved,base:remote,current:optimistic,pending};
      await persist(current);
    }
  }
  if (!sameBaseline(current.base, remote)) {
    current = { ...current, remote, conflict: 'Server state changed. Your local moves are preserved; review both versions before continuing.' };
    await persist(current);
    return current;
  }
  while (current.pending.length) {
    const next = current.pending[0];
    // Validate permission and seats against the last acknowledged server state.
    applyMove(current.base, current.userId, next);
    let acknowledged: Match;
    try { acknowledged = await api.move(current.base.id, next, current.base.move_count); }
    catch (error) {
      if ([400,403,409,422].includes((error as {status?: number}).status??0)) {
        current = { ...current, conflict: 'Server rejected queued moves. Local progress is preserved for review.' };
        await persist(current);
        return current;
      }
      throw error;
    }
    const pending = current.pending.slice(1);
    let optimistic = acknowledged;
    for (const move of pending) optimistic = applyMove(optimistic, current.userId, move);
    current = { ...current, base: acknowledged, current: optimistic, pending };
    // Checkpoint every acknowledgment before attempting the following move.
    await persist(current);
  }
  return current;
}
