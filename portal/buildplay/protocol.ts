import { Json, Match, Move } from './types';

export function actingFor(match: Match, userId: string): number | null {
  if (match.status !== 'ongoing' || !match.turn_of_player_indices) return null;
  const seat = match.players.find(p => p.user_id === userId && p.kind === 'human');
  if (!seat) return null;
  if (match.turn_of_player_indices.includes(seat.player_index)) return seat.player_index;
  return match.players.find(p => p.kind === 'computer'
    && match.turn_of_player_indices!.includes(p.player_index))?.player_index ?? null;
}

export function stateChanged(match: Match, userId: string) {
  return {
    type: 'state_changed', state: match.state,
    players: match.players.map(p => ({ player_index: p.player_index, kind: p.kind,
      name: p.user_id ?? `Computer ${p.player_index + 1}` })),
    turn_of_player_indices: match.turn_of_player_indices,
    turn_of_player_index: match.turn_of_player_indices?.[0] ?? null,
    status: match.status, end_reason: match.end_reason, move_count: match.move_count,
    my_player_index: match.players.find(p => p.user_id === userId)?.player_index ?? null,
    acting_for_player_index: actingFor(match, userId),
  };
}

export function parseMove(value: unknown): Move {
  if (!value || typeof value !== 'object') throw new Error('Invalid game message');
  const m = value as Record<string, unknown>;
  let next = m.next_turn_player_indices;
  if (next === undefined && Number.isInteger(m.next_turn_player_index)) next = [m.next_turn_player_index];
  if (m.type !== 'make_move' || !('new_state' in m)
    || !(next === null || Array.isArray(next) && next.length > 0
      && next.every(n => Number.isSafeInteger(n) && n >= 0) && new Set(next).size === next.length)) {
    throw new Error('Malformed make_move message');
  }
  // postMessage permits values JSON cannot persist; reject them before changing a match.
  function validateJson(value:unknown,ancestors:Set<object>):void {
    if(value===null||typeof value==='string'||typeof value==='boolean')return;
    if(typeof value==='number'&&Number.isFinite(value))return;
    if(!value||typeof value!=='object'||ancestors.has(value))throw new Error('Game state must be finite, acyclic JSON');
    ancestors.add(value);
    if(Array.isArray(value))for(let i=0;i<value.length;i++)validateJson(value[i],ancestors);
    else {
      if(Object.prototype.toString.call(value)!=='[object Object]')throw new Error('Game state must be JSON');
      for(const item of Object.values(value))validateJson(item,ancestors);
    }
    ancestors.delete(value);
  }
  validateJson(m.new_state,new Set());
  const serialized = JSON.stringify(m.new_state);
  if (serialized === undefined) throw new Error('Game state must be JSON');
  return { new_state: JSON.parse(serialized) as Json, next_turn_player_indices: next as number[] | null };
}

export function applyMove(match: Match, userId: string, move: Move): Match {
  if (actingFor(match, userId) === null) throw new Error('It is not your turn');
  if (move.next_turn_player_indices?.some(i => !match.players.some(p => p.player_index === i))) {
    throw new Error('Unknown player seat');
  }
  return { ...match, state: move.new_state, turn_of_player_indices: move.next_turn_player_indices,
    move_count: match.move_count + 1, status: move.next_turn_player_indices === null ? 'over' : 'ongoing',
    end_reason: move.next_turn_player_indices === null ? 'finished' : null };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k =>
    JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(value);
}

export function sameBaseline(a: Match, b: Match): boolean {
  return a.id === b.id && a.game_id === b.game_id && a.game_version === b.game_version
    && a.move_count === b.move_count && a.status === b.status && a.end_reason===b.end_reason && a.owner_user_id===b.owner_user_id
    && canonical(a.players) === canonical(b.players) && canonical(a.state) === canonical(b.state)
    && canonical(a.turn_of_player_indices) === canonical(b.turn_of_player_indices);
}
