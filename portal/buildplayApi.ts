import AsyncStorage from '@react-native-async-storage/async-storage';
import { Board, createBoard, getResult } from '../games/ticTacToe';

declare const process: { env: { EXPO_PUBLIC_BUILDPLAY_API_URL?: string } };

export type BuildplayUser = {
  userId: string;
  password: string;
  displayName: string;
};

export type BuildplayPlayer = {
  player_index: number;
  kind: 'human' | 'computer';
  user_id: string | null;
};

export type BuildplayGame = {
  id: string;
  version: number;
  name: string;
  description: string;
  allowed_player_counts: number[];
  allows_leave_mid_match: boolean;
  allows_join_mid_match: boolean;
  code: string;
};

export type BuildplayMatch = {
  id: string;
  game_id: string;
  game_version: number;
  owner_user_id: string;
  status: 'waiting_for_players' | 'ongoing' | 'over';
  end_reason: 'finished' | 'player_left' | null;
  players: BuildplayPlayer[];
  turn_of_player_indices: number[] | null;
  state: unknown;
  move_count: number;
};

const API_URL = (process.env.EXPO_PUBLIC_BUILDPLAY_API_URL ?? 'https://buildplay.fun').replace(/\/+$/, '');
const USER_STORAGE_KEY = 'gameportal.buildplay-user.v1';
const TICTACTOE_GAME_ID = 'tictactoe';

async function request<T>(
  path: string,
  options: RequestInit = {},
  user?: BuildplayUser,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (user) {
    headers.set('X-User-Id', user.userId);
    headers.set('X-User-Password', user.password);
  }

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`buildplay.fun request failed (${response.status}): ${detail || response.statusText}`);
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export async function getSavedBuildplayUser(): Promise<BuildplayUser | null> {
  const raw = await AsyncStorage.getItem(USER_STORAGE_KEY);
  if (raw === null) return null;
  const user: unknown = JSON.parse(raw);
  if (!user || typeof user !== 'object'
    || typeof (user as BuildplayUser).userId !== 'string'
    || typeof (user as BuildplayUser).password !== 'string'
    || typeof (user as BuildplayUser).displayName !== 'string') {
    throw new Error('Saved buildplay.fun account data is invalid. Clear the app storage and try again.');
  }
  return user as BuildplayUser;
}

export async function getOrCreateBuildplayUser(displayName: string): Promise<BuildplayUser> {
  const saved = await getSavedBuildplayUser();
  if (saved) return saved;

  const cleanName = displayName.trim().slice(0, 20) || 'Player';
  const created = await request<{ id: string; password: string; display_name: string }>('/users', {
    method: 'POST',
    body: JSON.stringify({ display_name: cleanName }),
  });
  const user = { userId: created.id, password: created.password, displayName: created.display_name };
  await AsyncStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  return user;
}

export async function listBuildplayGames(): Promise<BuildplayGame[]> {
  const games = await request<BuildplayGame[]>('/games');
  if (!Array.isArray(games)) throw new Error('buildplay.fun returned an invalid game catalog.');
  return games.filter(game =>
    game && typeof game.id === 'string'
    && Number.isInteger(game.version)
    && typeof game.name === 'string'
    && typeof game.description === 'string'
    && Array.isArray(game.allowed_player_counts)
    && game.allowed_player_counts.length > 0
    && typeof game.code === 'string'
    && game.code.length > 0
    && game.id !== 'debug'
    && !/debug/i.test(game.name)
    && !/deployment check/i.test(game.name),
  );
}

export function createBuildplayMatch(gameId: string, user: BuildplayUser): Promise<BuildplayMatch> {
  return request('/matches', {
    method: 'POST',
    body: JSON.stringify({ game_id: gameId }),
  }, user);
}

export function joinBuildplayMatch(matchId: string, user: BuildplayUser): Promise<BuildplayMatch> {
  return request(`/matches/${encodeURIComponent(matchId)}/join`, { method: 'POST' }, user);
}

export function getBuildplayMatch(matchId: string): Promise<BuildplayMatch> {
  return request(`/matches/${encodeURIComponent(matchId)}`);
}

export function getBuildplayGameVersion(gameId: string, version: number): Promise<BuildplayGame> {
  return request(`/games/${encodeURIComponent(gameId)}/versions/${version}`);
}

export function startBuildplayMatch(matchId: string, user: BuildplayUser): Promise<BuildplayMatch> {
  return request(`/matches/${encodeURIComponent(matchId)}/start`, {
    method: 'POST',
    body: JSON.stringify({
      first_turn_player_indices: [0],
    }),
  }, user);
}

export function submitBuildplayMove(
  match: BuildplayMatch,
  newState: unknown,
  nextPlayerIndices: number[] | null,
  user: BuildplayUser,
): Promise<BuildplayMatch> {
  return request(`/matches/${encodeURIComponent(match.id)}/moves`, {
    method: 'POST',
    body: JSON.stringify({
      new_state: newState,
      next_turn_player_indices: nextPlayerIndices,
      expected_move_count: match.move_count,
    }),
  }, user);
}
