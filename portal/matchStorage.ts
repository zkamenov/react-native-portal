import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocalMatch } from './matches';
import { getCurrentPlayer, getResult } from '../games/ticTacToe';

export const MATCH_STORAGE_KEY = 'gameportal.local-matches.v1';

export function decodeMatches(raw: string | null): LocalMatch[] {
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if ((data.version !== 1 && data.version !== 2 && data.version !== 3) || !Array.isArray(data.matches)) {
    throw new Error('Unsupported match data');
  }
  const ids = new Set<string>();
  for (const match of data.matches) {
    if (!match || typeof match.id !== 'string' || !/^[1-9]\d*$/.test(match.id)
      || !Number.isSafeInteger(Number(match.id)) || Number(match.id) >= Number.MAX_SAFE_INTEGER
      || ids.has(match.id) || typeof match.gameName !== 'string' || !match.gameName.trim()
      || !Array.isArray(match.board) || match.board.length !== 9
      || !match.board.every((cell: unknown) => cell === null || cell === 'X' || cell === 'O')) {
      throw new Error('Invalid match data');
    }
    const source = match.source ?? 'local';
    if ((source !== 'local' && source !== 'online')
      || (source === 'online' && (typeof match.serverMatchId !== 'string'
        || !match.serverMatchId.trim()
        || !Number.isInteger(match.playerIndex)
        || match.playerIndex < 0 || match.playerIndex > 1))
      || (source === 'local' && (match.serverMatchId !== undefined || match.playerIndex !== undefined))) {
      throw new Error('Invalid match source');
    }
    if (source === 'local' && match.gameName !== 'Tic-Tac-Toe') {
      throw new Error('Invalid local game name');
    }
    if (source === 'online' && match.gameId !== undefined
      && (typeof match.gameId !== 'string' || !match.gameId
        || !Number.isInteger(match.gameVersion) || typeof match.gameCode !== 'string'
        || !match.gameCode || !['waiting_for_players', 'ongoing', 'over'].includes(match.serverStatus)
        || (match.allowedPlayerCounts !== undefined
          && (!Array.isArray(match.allowedPlayerCounts)
            || match.allowedPlayerCounts.length === 0
            || !match.allowedPlayerCounts.every((count: unknown) => Number.isInteger(count) && Number(count) > 0)))
        || !match.onlineState || typeof match.onlineState !== 'object' || Array.isArray(match.onlineState)
        || (match.onlineState as Record<string, unknown>).id !== match.serverMatchId
        || (match.onlineState as Record<string, unknown>).game_id !== match.gameId
        || (match.onlineState as Record<string, unknown>).game_version !== match.gameVersion
        || (match.onlineState as Record<string, unknown>).status !== match.serverStatus
        || !Array.isArray((match.onlineState as Record<string, unknown>).players)
        || !Number.isInteger((match.onlineState as Record<string, unknown>).move_count))) {
      throw new Error('Invalid online match snapshot');
    }
    const result = getResult(match.board);
    const xCount = match.board.filter((cell: unknown) => cell === 'X').length;
    const oCount = match.board.filter((cell: unknown) => cell === 'O').length;
    const hasOnlineSnapshot = source === 'online' && typeof match.gameId === 'string';
    const isGenericOnline = hasOnlineSnapshot && match.gameId !== 'tictactoe';
    if (isGenericOnline
      ? (match.result !== null || match.currentTurn !== null
        || match.board.some((cell: unknown) => cell !== null)
        || match.status !== (match.serverStatus === 'over' ? 'finished' : 'active'))
      : hasOnlineSnapshot
        ? ((xCount !== oCount && xCount !== oCount + 1)
          || (result === 'X' && xCount !== oCount + 1)
          || (result === 'O' && xCount !== oCount)
          || match.result !== result
          || match.status !== (match.serverStatus === 'over' || result !== null ? 'finished' : 'active')
          || match.currentTurn !== (result === null && match.serverStatus !== 'over' ? getCurrentPlayer(match.board) : null))
      : ((xCount !== oCount && xCount !== oCount + 1)
        || (result === 'X' && xCount !== oCount + 1)
        || (result === 'O' && xCount !== oCount)
        || match.result !== result
        || match.status !== (result === null ? 'active' : 'finished')
        || match.currentTurn !== (result === null ? getCurrentPlayer(match.board) : null))) {
      throw new Error('Inconsistent match data');
    }
    match.source = source;
    ids.add(match.id);
  }
  return data.matches;
}

export function nextMatchId(matches: LocalMatch[]): number {
  return matches.reduce((largest, match) => Math.max(largest, Number(match.id)), 0) + 1;
}

type Storage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export function createMatchStorage(storage: Storage) {
  let pending: Promise<void> = Promise.resolve();
  return {
    async load(): Promise<LocalMatch[]> {
      return decodeMatches(await storage.getItem(MATCH_STORAGE_KEY));
    },
    save(matches: LocalMatch[]): Promise<void> {
      // Capture this snapshot now; queue writes so the newest snapshot is saved last.
      const snapshot = JSON.stringify({ version: 3, matches });
      const write = pending.then(() => storage.setItem(MATCH_STORAGE_KEY, snapshot));
      pending = write.catch(() => {});
      return write;
    },
  };
}

export const matchStorage = createMatchStorage(AsyncStorage);
