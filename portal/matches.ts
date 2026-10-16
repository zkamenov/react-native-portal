import { Board, Player, createBoard, getCurrentPlayer, getResult, playMove } from '../games/ticTacToe';

export type LocalMatch = {
  id: string;
  gameName: string;
  board: Board;
  status: 'active' | 'finished';
  currentTurn: Player | null;
  result: Player | 'draw' | null;
  mode?: 'local' | 'computer';
  source: 'local' | 'online';
  serverMatchId?: string;
  playerIndex?: number;
  gameId?: string;
  gameVersion?: number;
  gameCode?: string;
  allowedPlayerCounts?: number[];
  serverStatus?: 'waiting_for_players' | 'ongoing' | 'over';
  onlineState?: unknown;
};

export function createMatch(id: string, mode: 'local' | 'computer' = 'local'): LocalMatch {
  return {
    id, gameName: 'Tic-Tac-Toe', board: createBoard(),
    status: 'active', currentTurn: 'X', result: null, source: 'local',
    ...(mode === 'computer' ? { mode } : {}),
  };
}

export function moveInMatch(matches: LocalMatch[], id: string, index: number): LocalMatch[] {
  return matches.map(match => {
    if (match.id !== id || match.status === 'finished') return match;
    const board = playMove(match.board, index);
    if (board === match.board) return match;
    const result = getResult(board);
    return {
      ...match, board, result,
      status: result === null ? 'active' : 'finished',
      currentTurn: result === null ? getCurrentPlayer(board) : null,
    };
  });
}

export function matchStatusLabel(match: LocalMatch): string {
  if (match.source === 'online') {
    if (match.result === 'draw') return 'Draw';
    if (match.result) return `${match.result} won`;
    if (match.serverStatus === 'waiting_for_players') return 'Waiting for players';
    if (match.serverStatus === 'over') return 'Match finished';
    if (match.serverStatus === 'ongoing' && match.onlineState && typeof match.onlineState === 'object') {
      const onlineMatch = match.onlineState as { turn_of_player_indices?: number[] | null };
      const turn = onlineMatch.turn_of_player_indices?.[0];
      return turn === match.playerIndex ? 'Your turn' : 'Opponent’s turn';
    }
  }
  if (match.result === 'draw') return 'Draw';
  if (match.result) return `${match.result} won`;
  return `Player ${match.currentTurn}'s turn`;
}
