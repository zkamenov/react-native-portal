import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BuildplayGame,
  BuildplayMatch,
  getBuildplayGameVersion,
  listOpenBuildplayMatches,
} from '../portal/buildplayApi';

type OpenGame = {
  match: BuildplayMatch;
  game: BuildplayGame;
};

type Props = {
  onJoin: (game: BuildplayGame, matchId: string) => void;
};

export default function OpenGamesScreen({ onJoin }: Props) {
  const [openGames, setOpenGames] = useState<OpenGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let refreshing = false;

    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const matches = await listOpenBuildplayMatches();
        const gameVersions = new Map<string, Promise<BuildplayGame>>();
        const entries = await Promise.all(matches.map(async match => {
          const versionKey = `${match.game_id}:${match.game_version}`;
          let gameRequest = gameVersions.get(versionKey);
          if (!gameRequest) {
            gameRequest = getBuildplayGameVersion(match.game_id, match.game_version);
            gameVersions.set(versionKey, gameRequest);
          }
          return { match, game: await gameRequest };
        }));
        if (!cancelled) {
          setOpenGames(entries);
          setErrorMessage('');
        }
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoading(false);
        refreshing = false;
      }
    }

    setLoading(true);
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [retry]);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.brand}>GamePortal</Text>
      <Text style={styles.eyebrow}>JOIN A GAME</Text>
      <Text style={styles.heading} accessibilityRole="header">Games waiting for players</Text>
      <Text style={styles.subtitle}>Join an open online match. This list refreshes automatically.</Text>

      {errorMessage ? (
        <View style={styles.errorPanel}>
          <Text style={styles.error}>{errorMessage}</Text>
          <Pressable accessibilityRole="button" onPress={() => setRetry(current => current + 1)} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}

      {openGames.map(({ game, match }) => (
        <View key={match.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.gameName} accessibilityRole="header">{game.name}</Text>
            <Text style={styles.waiting}>Waiting for players</Text>
          </View>
          <Text style={styles.description}>{game.description}</Text>
          <Text style={styles.details}>
            {match.players.length} joined · {game.allowed_player_counts.join(', ')} players
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Join ${game.name} match ${match.id}`}
            onPress={() => onJoin(game, match.id)}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Text style={styles.buttonText}>Join Game</Text>
          </Pressable>
        </View>
      ))}

      {!loading && !errorMessage && openGames.length === 0 ? (
        <Text style={styles.empty}>No games are waiting right now. Check back soon.</Text>
      ) : null}
      {loading && openGames.length === 0 ? <Text style={styles.empty}>Loading open games…</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 24, paddingBottom: 48 },
  brand: { fontSize: 24, fontWeight: '800', color: '#1e3a8a', marginBottom: 40 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 2, color: '#64748b', marginBottom: 10 },
  heading: { fontSize: 30, fontWeight: '700', color: '#172033', marginBottom: 10 },
  subtitle: { fontSize: 16, lineHeight: 24, color: '#64748b', marginBottom: 24 },
  card: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, backgroundColor: '#fff', padding: 20, marginBottom: 16 },
  cardHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  gameName: { fontSize: 21, fontWeight: '700', color: '#172033' },
  waiting: { fontSize: 13, fontWeight: '700', color: '#a16207', backgroundColor: '#fef3c7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  description: { fontSize: 15, lineHeight: 23, color: '#64748b', marginTop: 12 },
  details: { fontSize: 14, color: '#475569', marginTop: 12, marginBottom: 16 },
  button: { minHeight: 48, borderRadius: 10, backgroundColor: '#2855c5', alignItems: 'center', justifyContent: 'center', padding: 12 },
  buttonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  empty: { fontSize: 16, color: '#64748b', textAlign: 'center', paddingVertical: 32 },
  errorPanel: { backgroundColor: '#fff', padding: 16, borderColor: '#fecaca', borderWidth: 1, borderRadius: 12, marginBottom: 20 },
  error: { color: '#b91c1c', fontSize: 14 },
  retryButton: { alignSelf: 'flex-start', marginTop: 12, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, backgroundColor: '#2855c5' },
  retryText: { color: '#fff', fontWeight: '700' },
  pressed: { opacity: 0.8 },
});
