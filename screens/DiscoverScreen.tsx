import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BuildplayGame,
  downloadBuildplayGame,
  getDownloadedBuildplayGames,
  listBuildplayGames,
} from '../portal/buildplayApi';

type Props = {
  search: string;
  onSearch: (value: string) => void;
  onChooseGame: (game: BuildplayGame, downloaded: boolean) => void;
};

function gameSymbol(name: string): string {
  if (/chess|checkers|checkers/i.test(name)) return '♟';
  if (/card|poker|rummy|hearts|war|president|truco|golf|ers/i.test(name)) return '♠';
  if (/connect|gomoku|tictactoe|tic-tac-toe|reversi|sos/i.test(name)) return '◉';
  return '✦';
}

function gameKey(game: BuildplayGame): string {
  return `${game.id}:${game.version}`;
}

export default function DiscoverScreen({ search, onSearch, onChooseGame }: Props) {
  const [games, setGames] = useState<BuildplayGame[]>([]);
  const [downloadedGames, setDownloadedGames] = useState<BuildplayGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    listBuildplayGames().then(available => {
      if (!cancelled) setGames(available);
    }).catch(error => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    getDownloadedBuildplayGames().then(downloaded => {
      if (!cancelled) setDownloadedGames(downloaded);
    }).catch(error => {
      if (!cancelled) setDownloadError(error instanceof Error ? error.message : String(error));
    });
    return () => { cancelled = true; };
  }, [retry]);

  async function downloadGame(game: BuildplayGame) {
    const key = gameKey(game);
    setDownloading(key);
    setDownloadError('');
    try {
      await downloadBuildplayGame(game);
      setDownloadedGames(current => [
        ...current.filter(item => gameKey(item) !== key),
        game,
      ]);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : String(error));
    } finally {
      setDownloading(null);
    }
  }

  const query = search.trim().toLowerCase();
  const downloadedKeys = new Set(downloadedGames.map(gameKey));
  const allGames = [
    ...downloadedGames,
    ...games.filter(game => !downloadedKeys.has(gameKey(game))),
  ];
  const visibleGames = allGames.filter(game =>
    game.name.toLowerCase().includes(query) || game.description.toLowerCase().includes(query),
  );

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={styles.brand} accessibilityRole="header">GamePortal</Text>
      <Text style={styles.eyebrow}>DISCOVER</Text>
      <Text style={styles.heading} accessibilityRole="header">What would you like to play?</Text>
      <Text style={styles.subtitle}>Download games to play offline, or play online and invite other players with a match ID.</Text>

      <TextInput
        style={styles.search}
        placeholder="Search games"
        placeholderTextColor="#64748b"
        accessibilityLabel="Search games"
        value={search}
        onChangeText={onSearch}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
      />

      {loading ? <Text style={styles.empty}>Loading games from buildplay.fun…</Text> : null}
      {loadError ? (
        <View style={styles.errorPanel}>
          <Text style={styles.error}>{loadError}{downloadedGames.length ? ' Showing games saved on this device.' : ''}</Text>
          <Pressable accessibilityRole="button" onPress={() => setRetry(current => current + 1)} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {downloadError ? <Text style={styles.error}>{downloadError}</Text> : null}

      <View style={styles.cards}>
        {visibleGames.map((game, index) => (
          <View key={gameKey(game)} style={styles.card}>
            <View style={[styles.art, { backgroundColor: colors[index % colors.length] }]}>
              <Text style={styles.symbol} accessible={false}>{gameSymbol(game.name)}</Text>
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.gameName} accessibilityRole="header">{game.name}</Text>
              {downloadedKeys.has(gameKey(game)) ? <Text style={styles.downloaded}>Downloaded for offline play</Text> : null}
              <Text style={styles.players}>{game.allowed_player_counts.join(', ')} players</Text>
              <Text style={styles.description}>{game.description}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Choose how to play ${game.name}`}
                onPress={() => onChooseGame(game, downloadedKeys.has(gameKey(game)))}
                style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              >
                <Text style={styles.buttonText}>Choose Mode</Text>
              </Pressable>
              {downloadedKeys.has(gameKey(game)) ? (
                <Text style={styles.downloadedStatus}>Ready to play offline</Text>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Download ${game.name} for offline play`}
                  disabled={downloading !== null}
                  onPress={() => { void downloadGame(game); }}
                  style={({ pressed }) => [styles.downloadButton, pressed && styles.pressed]}
                >
                  <Text style={styles.downloadButtonText}>
                    {downloading === gameKey(game) ? 'Downloading…' : 'Download for Offline Play'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        ))}
      </View>
      {!loading && !loadError && visibleGames.length === 0 ? (
        <Text style={styles.empty}>No games found. Try another name.</Text>
      ) : null}
      {!loading && loadError && visibleGames.length === 0 ? (
        <Text style={styles.empty}>No games are saved for offline play yet.</Text>
      ) : null}
    </ScrollView>
  );
}

const colors = ['#e8efff', '#fceee9', '#e8f4ef', '#f3eafe'];

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 24, paddingBottom: 48 },
  brand: { fontSize: 24, fontWeight: '800', color: '#1e3a8a', marginBottom: 40 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 2, color: '#64748b', marginBottom: 10 },
  heading: { fontSize: 30, fontWeight: '700', color: '#172033', marginBottom: 10 },
  subtitle: { fontSize: 16, lineHeight: 24, color: '#64748b', marginBottom: 24 },
  search: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#172033', marginBottom: 28, minHeight: 48 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  card: { flexGrow: 1, flexBasis: 270, maxWidth: '100%', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, backgroundColor: '#fff', overflow: 'hidden' },
  art: { height: 120, alignItems: 'center', justifyContent: 'center' },
  symbol: { fontSize: 48, fontWeight: '700', color: '#334155' },
  cardBody: { padding: 20, flex: 1 },
  gameName: { fontSize: 21, fontWeight: '700', color: '#172033' },
  downloaded: { fontSize: 13, fontWeight: '700', color: '#15803d', marginTop: 6 },
  players: { fontSize: 14, color: '#475569', marginTop: 8 },
  description: { fontSize: 15, lineHeight: 23, color: '#64748b', marginTop: 12, marginBottom: 24, flexGrow: 1 },
  button: { minHeight: 48, borderRadius: 10, backgroundColor: '#2855c5', alignItems: 'center', justifyContent: 'center', padding: 12 },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  downloadButton: { minHeight: 44, marginTop: 8, borderRadius: 10, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center', padding: 10 },
  downloadButtonText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  downloadedStatus: { fontSize: 13, fontWeight: '600', color: '#15803d', textAlign: 'center', paddingTop: 12 },
  empty: { fontSize: 16, color: '#64748b', textAlign: 'center', paddingVertical: 32 },
  errorPanel: { backgroundColor: '#fff', padding: 16, borderColor: '#fecaca', borderWidth: 1, borderRadius: 12, marginBottom: 20 },
  error: { color: '#b91c1c', fontSize: 14 },
  retryButton: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#2855c5' },
  retryText: { color: '#fff', fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
