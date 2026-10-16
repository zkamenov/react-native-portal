import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import HostedGameView from '../components/HostedGameView';
import { BuildplayGame, BuildplayMatch, BuildplayPlayer } from '../portal/buildplayApi';
import { createGameStateMessage, getNextTurnPlayerIndices } from '../portal/buildplayGameProtocol';

type Props = {
  game: BuildplayGame;
  onBack: () => void;
};

function createOfflineMatch(game: BuildplayGame): BuildplayMatch | null {
  const playerCount = game.allowed_player_counts
    .filter(count => count >= 2)
    .sort((left, right) => left - right)[0];
  if (playerCount === undefined) return null;

  const players: BuildplayPlayer[] = Array.from({ length: playerCount }, (_, playerIndex) => ({
    player_index: playerIndex,
    kind: playerIndex === 0 ? 'human' : 'computer',
    user_id: playerIndex === 0 ? 'offline-player' : null,
  }));
  return {
    id: 'offline-match',
    game_id: game.id,
    game_version: game.version,
    owner_user_id: 'offline-player',
    status: 'ongoing',
    end_reason: null,
    players,
    turn_of_player_indices: [0],
    state: null,
    move_count: 0,
  };
}

export default function OfflineBuildplayGame({ game, onBack }: Props) {
  const [match, setMatch] = useState(() => createOfflineMatch(game));
  const [errorMessage, setErrorMessage] = useState('');
  const activePlayerIndexRef = useRef<number | null>(null);

  const turnIndices = match?.turn_of_player_indices ?? [];
  const actingPlayerIndex = match?.status === 'ongoing'
    ? turnIndices.includes(0) ? 0 : turnIndices.find(index => index > 0) ?? null
    : null;
  activePlayerIndexRef.current = actingPlayerIndex;
  const computerTurn = actingPlayerIndex !== null && actingPlayerIndex !== 0;
  const gameStateMessage = useMemo(
    () => match
      ? createGameStateMessage(match, actingPlayerIndex ?? 0, game.allowed_player_counts)
      : {},
    [actingPlayerIndex, game.allowed_player_counts, match],
  );

  function handleMove(message: Record<string, unknown>) {
    if (message.type !== 'make_move') return;
    const actingPlayer = activePlayerIndexRef.current;
    if (!match || actingPlayer !== 0 || match.status !== 'ongoing') return;
    if (!Object.prototype.hasOwnProperty.call(message, 'new_state')) {
      setErrorMessage('The game sent a move without an updated state.');
      return;
    }

    let nextPlayers: number[] | null;
    try {
      nextPlayers = getNextTurnPlayerIndices(message, match.players.length);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    setErrorMessage('');
    setMatch(current => {
      if (!current || current.status !== 'ongoing') return current;
      return {
        ...current,
        state: message.new_state,
        turn_of_player_indices: nextPlayers,
        status: nextPlayers === null ? 'over' : 'ongoing',
        end_reason: nextPlayers === null ? 'finished' : null,
        move_count: current.move_count + 1,
      };
    });
  }

  function playAgain() {
    setErrorMessage('');
    setMatch(createOfflineMatch(game));
  }

  if (!match) {
    return (
      <View style={styles.content}>
        <Text style={styles.brand}>GamePortal</Text>
        <Text style={styles.title}>{game.name}</Text>
        <Text style={styles.error}>This game does not support a match with two or more players.</Text>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.button}>
          <Text style={styles.buttonText}>Back to Games</Text>
        </Pressable>
      </View>
    );
  }

  const status = match.status === 'over'
    ? 'Game over'
    : computerTurn ? 'Computer opponent unavailable' : 'Your turn';

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>GamePortal</Text>
        <Text style={styles.title}>{game.name}</Text>
        <Text style={styles.subtitle}>Offline play · You are Player 1</Text>
        <Text style={styles.note}>
          This game needs a game-specific computer opponent for offline play. No automated moves will be made.
        </Text>
        <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      </ScrollView>
      <HostedGameView
        key={`${game.id}:${game.version}`}
        code={game.code}
        stateMessage={gameStateMessage}
        readOnly={computerTurn}
        onMove={handleMove}
      />
      <View style={styles.actions}>
        {match.status === 'over' ? (
          <Pressable accessibilityRole="button" onPress={playAgain} style={styles.button}>
            <Text style={styles.buttonText}>Play Again</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onBack} style={[styles.button, styles.back]}>
          <Text style={styles.backText}>Back to Games</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20 },
  content: { width: '100%', maxWidth: 1000, alignSelf: 'center', paddingBottom: 8 },
  brand: { fontSize: 24, fontWeight: '800', color: '#1e3a8a', marginBottom: 8 },
  title: { fontSize: 30, fontWeight: '700', color: '#172033' },
  subtitle: { fontSize: 15, color: '#64748b', marginTop: 6 },
  note: { fontSize: 14, lineHeight: 21, color: '#64748b', marginTop: 8 },
  status: { fontSize: 18, fontWeight: '700', color: '#172033', marginTop: 10 },
  error: { color: '#b91c1c', fontSize: 14, fontWeight: '600', marginVertical: 8 },
  actions: { width: '100%', maxWidth: 1000, alignSelf: 'center', gap: 8, paddingTop: 8 },
  button: { minHeight: 48, padding: 14, borderRadius: 10, backgroundColor: '#2855c5', alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  back: { backgroundColor: '#edf1f7' },
  backText: { fontSize: 16, fontWeight: '700', color: '#334155' },
});
