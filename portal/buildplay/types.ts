export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Identity = { id: string; password: string };
export type AuthResponse = {
  user_id: string; password: string; display_name: string;
  email?: string; picture_url?: string; merged_from_user_id?: string | null;
};
export type GameSummary = {
  id: string; version: number; name: string; description: string;
  allowed_player_counts: number[]; published: boolean;
};
export type Game = GameSummary & { code: string; offlineCode?: string; cachedAt?: string };
export type Seat = { player_index: number; kind: 'human' | 'computer'; user_id: string | null };
export type Match = {
  id: string; game_id: string; game_version: number; owner_user_id: string;
  status: 'waiting_for_players' | 'ongoing' | 'over'; end_reason: string | null;
  players: Seat[]; turn_of_player_indices: number[] | null;
  state: Json; move_count: number; created_at: string; updated_at: string;
};
export type Move = { new_state: Json; next_turn_player_indices: number[] | null };
export type SavedMatch = {
  base: Match; current: Match; pending: Move[]; userId: string; server: string;
  conflict?: string;
  remote?: Match;
  localOnly?: boolean;
};
