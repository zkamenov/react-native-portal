import { Game, GameSummary, SavedMatch } from './types';

export type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
const PREFIX = 'gameportal.buildplay.v1.';
export function createRepository(storage: Storage) {
  let tail: Promise<unknown> = Promise.resolve();
  let cacheTail: Promise<unknown> = Promise.resolve();
  function write(key: string, value: unknown): Promise<void> {
    const raw = JSON.stringify(value);
    const task = tail.then(() => storage.setItem(PREFIX + key, raw));
    tail = task.catch(() => {});
    return task;
  }
  async function read<T>(key: string, fallback: T): Promise<T> {
    await tail;
    const raw = await storage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw) as T;
  }
  function scope(server: string) { return encodeURIComponent(server); }
  // Serialize the index and game together with other writes. An interrupted index
  // update can hide a cache entry, but must never label missing bytes as available.
  async function putGame(server: string, game: Game) {
    if (!game || typeof game.code !== 'string' || !game.code.trim()) throw new Error('Game endpoint returned no HTML code');
    await write(`game.${scope(server)}.${encodeURIComponent(game.id)}.${game.version}`, game);
    const entries = await read<GameSummary[]>(`library.${scope(server)}`, []);
    const {code: _code, offlineCode: _offlineCode, ...metadata} = game;
    await write(`library.${scope(server)}`, [...entries.filter(g => g.id !== game.id || g.version !== game.version), metadata]);
  }
  return {
    // Game code is the actual versioned HTML document, including inline CSS and JS.
    cacheGame: (server:string,game:Game):Promise<void> => {
      const operation=cacheTail.then(()=>putGame(server,game));
      cacheTail=operation.catch(()=>{});
      return operation;
    },
    library: (server: string) => read<GameSummary[]>(`library.${scope(server)}`, []),
    game: (server: string, id: string, version: number) => read<Game | null>(`game.${scope(server)}.${encodeURIComponent(id)}.${version}`, null),
    saveCatalog: (server: string, games: GameSummary[]) => write(`catalog.${scope(server)}`, games.map(g => ({
      id:g.id, version:g.version, name:g.name, description:g.description,
      allowed_player_counts:g.allowed_player_counts, published:g.published,
    }))),
    catalog: (server: string) => read<GameSummary[]>(`catalog.${scope(server)}`, []),
    saveMatches: (server: string, user: string, matches: SavedMatch[]) => write(`matches.${scope(server)}.${encodeURIComponent(user)}`, matches),
    matches: (server: string, user: string) => read<SavedMatch[]>(`matches.${scope(server)}.${encodeURIComponent(user)}`, []),
  };
}
