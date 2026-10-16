import { useEffect, useRef, useState } from 'react';
import { LocalMatch, createMatch, moveInMatch } from './matches';
import { matchStorage, nextMatchId } from './matchStorage';
import { BuildplayGame, BuildplayMatch } from './buildplayApi';
import { Board, Player, getResult, getCurrentPlayer } from '../games/ticTacToe';

function isTicTacToeBoard(value: unknown): value is Board {
  return Array.isArray(value)
    && value.length === 9
    && value.every((square: unknown) => square === '' || square === null || square === 'X' || square === 'O');
}

export default function useLocalMatches() {
  const [matches, setMatches] = useState<LocalMatch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error'>('saved');
  const [retry, setRetry] = useState(0);
  const nextId = useRef(1);
  const onlineMatchIds = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    matchStorage.load().then(restored => {
      if (cancelled) return;
      nextId.current = nextMatchId(restored);
      const restoredOnlineIds = new Map<string, string>();
      for (const match of restored) {
        if (match.source === 'online' && match.serverMatchId) {
          restoredOnlineIds.set(match.serverMatchId, match.id);
        }
      }
      onlineMatchIds.current = restoredOnlineIds;
      setMatches(restored);
      setLoaded(true);
    }).catch(() => {
      if (!cancelled) setLoadError(true);
    });
    return () => { cancelled = true; };
  }, [retry]);

  useEffect(() => {
    if (!loaded) return; // Never overwrite saved records with the initial empty array.
    let cancelled = false;
    setSaveStatus('saving');
    matchStorage.save(matches).then(() => {
      if (!cancelled) setSaveStatus('saved');
    }).catch(() => {
      if (!cancelled) setSaveStatus('error');
    });
    return () => { cancelled = true; };
  }, [matches, loaded]);

  function startMatch(mode: 'local' | 'computer' = 'local'): string {
    const match = createMatch(String(nextId.current++), mode);
    setMatches(current => [...current, match]);
    return match.id;
  }

  function saveOnlineMatch(game: BuildplayGame, match: BuildplayMatch, playerIndex: number) {
    const state = match.state as { board?: unknown } | null;
    const ticTacToeBoard = state?.board;
    const isTicTacToe = game.id === 'tictactoe' && isTicTacToeBoard(ticTacToeBoard);
    const storedBoard = isTicTacToe
      ? ticTacToeBoard.map(square => square === 'X' || square === 'O' ? square : null)
      : Array(9).fill(null);
    const result = isTicTacToe ? getResult(storedBoard) : null;
    const currentTurn: Player | null = isTicTacToe && result === null && match.status !== 'over'
      ? getCurrentPlayer(storedBoard)
      : null;
    const status = match.status === 'over' || result !== null ? 'finished' : 'active';
    let localId = onlineMatchIds.current.get(match.id);
    if (!localId) {
      localId = String(nextId.current++);
      onlineMatchIds.current.set(match.id, localId);
    }

    setMatches(current => {
      const previous = current.find(item => item.source === 'online' && item.serverMatchId === match.id);
      if (previous
        && previous.board.every((square, index) => square === storedBoard[index])
        && previous.status === status
        && previous.currentTurn === currentTurn
        && previous.result === result
        && previous.playerIndex === playerIndex
        && previous.gameVersion === game.version
        && JSON.stringify(previous.allowedPlayerCounts) === JSON.stringify(game.allowed_player_counts)
        && previous.serverStatus === match.status
        && JSON.stringify(previous.onlineState) === JSON.stringify(match)
        && previous.gameCode === game.code) {
        return current;
      }
      const base = previous ?? { ...createMatch(localId), gameName: game.name };
      const saved: LocalMatch = {
        ...base,
        board: storedBoard,
        gameName: game.name,
        status,
        currentTurn,
        result,
        source: 'online',
        serverMatchId: match.id,
        playerIndex,
        gameId: game.id,
        gameVersion: game.version,
        gameCode: game.code,
        allowedPlayerCounts: game.allowed_player_counts,
        serverStatus: match.status,
        onlineState: match,
      };
      return previous
        ? current.map(item => item.id === previous.id ? saved : item)
        : [...current, saved];
    });
  }

  return {
    matches, loaded, loadError, saveStatus,
    retryLoad: () => setRetry(current => current + 1),
    startMatch,
    move: (id: string, index: number) => setMatches(current => moveInMatch(current, id, index)),
    saveOnlineMatch,
  };
}
