import { AuthResponse, Game, GameSummary, Identity, Match, Move } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function normalizeServer(value: string): string {
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Enter the BuildPlay server HTTP(S) address');
  }
  return url.href.replace(/\/$/, '');
}
export function createApi(server: string, identity?: Identity) {
  const base = normalizeServer(server);
  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (identity) { headers['X-User-Id'] = identity.id; headers['X-User-Password'] = identity.password; }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(base + path, { method, headers, signal: controller.signal,
        body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new ApiError(response.status, typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail));
      return data as T;
    } finally { clearTimeout(timeout); }
  }
  return {
    authConfig: () => request<{ google_client_id: string }>('/auth/config'),
    // Deliberately use an anonymous API instance when logging in: passing an
    // existing identity would link/merge accounts on the professor's backend.
    googleLogin: (idToken: string) => request<AuthResponse>('/auth/google', 'POST', { id_token: idToken }),
    games: () => request<GameSummary[]>('/games'),
    game: (id: string, version: number) => request<Game>(`/games/${encodeURIComponent(id)}/versions/${version}`),
    matches: () => request<Match[]>('/matches'),
    match: (id: string) => request<Match>(`/matches/${encodeURIComponent(id)}`),
    history: (id: string) => request<Array<Move & { move_number: number; made_by_user_id: string; player_index: number }>>(`/matches/${encodeURIComponent(id)}/moves`),
    openMatches: () => request<Match[]>('/matches/open'),
    join: (id: string) => request<Match>(`/matches/${encodeURIComponent(id)}/join`, 'POST', {}),
    createMatch: (id: string, computers: number) => request<Match>('/matches', 'POST', { game_id: id, num_computer_opponents: computers }),
    start: (id: string) => request<Match>(`/matches/${encodeURIComponent(id)}/start`, 'POST', {}),
    move: (id: string, move: Move, count: number) => request<Match>(`/matches/${encodeURIComponent(id)}/moves`, 'POST', { ...move, expected_move_count: count }),
    createUser: (display_name: string) => request<Identity>('/users', 'POST', { display_name }),
  };
}
