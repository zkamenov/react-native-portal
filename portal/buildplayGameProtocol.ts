import { BuildplayMatch } from './buildplayApi';

export function createGameStateMessage(
  match: BuildplayMatch,
  playerIndex: number,
  allowedPlayerCounts: number[] = [],
): Record<string, unknown> {
  const turnIndices = match.turn_of_player_indices ?? [];
  const requiredWaitingPlayers = match.status === 'waiting_for_players'
    ? allowedPlayerCounts
      .filter(count => count >= match.players.length)
      .sort((left, right) => left - right)[0] ?? match.players.length
    : match.players.length;
  const players = Array.from({ length: Math.max(requiredWaitingPlayers, match.players.length) }, (_, index) => {
    const player = match.players.find(candidate => candidate.player_index === index);
    return player
      ? {
        ...player,
        name: player.kind === 'computer' ? `Computer ${player.player_index + 1}` : `Player ${player.player_index + 1}`,
      }
      : {
        player_index: index,
        kind: 'human',
        user_id: null,
        name: `Waiting for player ${index + 1}`,
      };
  });
  return {
    type: 'state_changed',
    match_id: match.id,
    status: match.status,
    state: match.state,
    players,
    my_player_index: playerIndex,
    turn_of_player_index: turnIndices[0] ?? null,
    turn_of_player_indices: turnIndices.length > 0 ? turnIndices : null,
    acting_for_player_index: match.status === 'ongoing' && turnIndices.includes(playerIndex) ? playerIndex : null,
  };
}

export function getNextTurnPlayerIndices(
  message: Record<string, unknown>,
  playerCount: number,
): number[] | null {
  let indices: unknown;
  if (Object.prototype.hasOwnProperty.call(message, 'next_turn_player_indices')) {
    indices = message.next_turn_player_indices;
  } else if (Object.prototype.hasOwnProperty.call(message, 'next_turn_player_index')) {
    const legacyIndex = message.next_turn_player_index;
    indices = legacyIndex === null ? null : [legacyIndex];
  } else {
    throw new Error('The game did not provide the next player turn.');
  }

  if (indices === null) return null;
  if (!Array.isArray(indices)
    || !indices.every(index => Number.isInteger(index) && index >= 0 && index < playerCount)
    || new Set(indices).size !== indices.length) {
    throw new Error('The game sent invalid next-turn player indices.');
  }
  return indices;
}
