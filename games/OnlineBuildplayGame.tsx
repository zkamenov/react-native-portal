import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import HostedGameView from '../components/HostedGameView';
import {
  BuildplayGame,
  BuildplayMatch,
  BuildplayUser,
  createBuildplayMatch,
  getBuildplayMatch,
  getBuildplayGameVersion,
  getOrCreateBuildplayUser,
  getSavedBuildplayUser,
  joinBuildplayMatch,
  startBuildplayMatch,
  submitBuildplayMove,
} from '../portal/buildplayApi';
import { createGameStateMessage, getNextTurnPlayerIndices } from '../portal/buildplayGameProtocol';

type Props = {
  game: BuildplayGame;
  onBack: () => void;
  onSaveMatch: (game: BuildplayGame, match: BuildplayMatch, playerIndex: number) => void;
};

function getPlayerIndex(match: BuildplayMatch, user: BuildplayUser): number {
  return match.players.find(player => player.user_id === user.userId)?.player_index ?? -1;
}

function canStartMatch(match: BuildplayMatch, game: BuildplayGame): boolean {
  return game.allowed_player_counts.includes(match.players.length)
    && match.players.every(player => player.kind === 'computer' || player.user_id !== null);
}

export default function OnlineBuildplayGame({ game, onBack, onSaveMatch }: Props) {
  const [activeGame, setActiveGame] = useState(game);
  const [match, setMatch] = useState<BuildplayMatch | null>(null);
  const [matchIdInput, setMatchIdInput] = useState('');
  const [displayName, setDisplayName] = useState('Player');
  const [user, setUser] = useState<BuildplayUser | null>(null);
  const [identityLoaded, setIdentityLoaded] = useState(false);
  const [playerIndex, setPlayerIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [stateSync, setStateSync] = useState(0);
  const startedMatches = useRef(new Set<string>());
  const moveInProgress = useRef(false);
  const onSaveMatchRef = useRef(onSaveMatch);
  onSaveMatchRef.current = onSaveMatch;

  useEffect(() => {
    getSavedBuildplayUser().then(saved => {
      if (saved) {
        setUser(saved);
        setDisplayName(saved.displayName);
      }
    }).catch(error => setErrorMessage(error instanceof Error ? error.message : String(error)))
      .finally(() => setIdentityLoaded(true));
  }, []);

  async function getUser(): Promise<BuildplayUser> {
    const currentUser = user ?? await getOrCreateBuildplayUser(displayName);
    setUser(currentUser);
    setDisplayName(currentUser.displayName);
    return currentUser;
  }

  async function createMatch() {
    setBusy(true);
    setErrorMessage('');
    try {
      const currentUser = await getUser();
      const created = await createBuildplayMatch(activeGame.id, currentUser);
      const versionedGame = created.game_version === activeGame.version
        ? activeGame
        : await getBuildplayGameVersion(activeGame.id, created.game_version);
      const index = getPlayerIndex(created, currentUser);
      if (index < 0) throw new Error('buildplay.fun did not return your player slot.');
      setActiveGame(versionedGame);
      setPlayerIndex(index);
      setMatch(created);
      onSaveMatchRef.current(versionedGame, created, index);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function joinMatch() {
    const id = matchIdInput.trim();
    if (!id) {
      setErrorMessage('Enter a match ID to join.');
      return;
    }
    setBusy(true);
    setErrorMessage('');
    try {
      const currentUser = await getUser();
      const joined = await joinBuildplayMatch(id, currentUser);
      if (joined.game_id !== activeGame.id) {
        throw new Error(`That match is for ${joined.game_id}, not ${activeGame.name}.`);
      }
      const versionedGame = joined.game_version === activeGame.version
        ? activeGame
        : await getBuildplayGameVersion(joined.game_id, joined.game_version);
      const index = getPlayerIndex(joined, currentUser);
      if (index < 0) throw new Error('buildplay.fun did not return your player slot.');
      setActiveGame(versionedGame);
      setPlayerIndex(index);
      setMatch(joined);
      onSaveMatchRef.current(versionedGame, joined, index);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  const activeMatchId = match?.id ?? null;
  useEffect(() => {
    if (activeMatchId === null || user === null) return;
    const matchId: string = activeMatchId;
    const currentUser: BuildplayUser = user;
    let cancelled = false;
    let refreshing = false;

    async function refreshMatch() {
      if (refreshing || moveInProgress.current) return;
      refreshing = true;
      try {
        let latest = await getBuildplayMatch(matchId);
        if (latest.game_id !== activeGame.id) {
          throw new Error('The server returned a match for a different game.');
        }
        const versionedGame = latest.game_version === activeGame.version
          ? activeGame
          : await getBuildplayGameVersion(latest.game_id, latest.game_version);
        if (latest.status === 'waiting_for_players'
          && latest.owner_user_id === currentUser.userId
          && canStartMatch(latest, versionedGame)
          && !startedMatches.current.has(matchId)) {
          startedMatches.current.add(matchId);
          try {
            latest = await startBuildplayMatch(matchId, currentUser);
          } catch (error) {
            startedMatches.current.delete(matchId);
            throw error;
          }
        }
        if (cancelled) return;
        const index = getPlayerIndex(latest, currentUser);
        if (index < 0) throw new Error('Your buildplay.fun account is no longer listed in this match.');
        setPlayerIndex(index);
        setMatch(previous => JSON.stringify(previous) === JSON.stringify(latest) ? previous : latest);
        setActiveGame(versionedGame);
        onSaveMatchRef.current(versionedGame, latest, index);
        setErrorMessage('');
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        refreshing = false;
      }
    }

    void refreshMatch();
    const timer = setInterval(() => { void refreshMatch(); }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeMatchId, activeGame, user]);

  async function handleGameMessage(message: Record<string, unknown>) {
    if (message.type !== 'make_move') return;
    if (!match || !user || busy || moveInProgress.current) return;
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
    moveInProgress.current = true;
    setBusy(true);
    setErrorMessage('');
    try {
      const nextMatch = await submitBuildplayMove(match, message.new_state, nextPlayers, user);
      setMatch(nextMatch);
      if (playerIndex !== null) onSaveMatchRef.current(activeGame, nextMatch, playerIndex);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setStateSync(current => current + 1);
    } finally {
      moveInProgress.current = false;
      setBusy(false);
    }
  }

  const gameStateMessage = useMemo(
    () => match && playerIndex !== null
      ? createGameStateMessage(match, playerIndex, activeGame.allowed_player_counts)
      : {},
    [activeGame.allowed_player_counts, match, playerIndex, stateSync],
  );

  if (!match || playerIndex === null) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>GamePortal</Text>
        <Text style={styles.title}>{activeGame.name}</Text>
        <Text style={styles.subtitle}>Online multiplayer · {activeGame.allowed_player_counts.join(', ')} players</Text>
        <Text style={styles.description}>{activeGame.description}</Text>
        <View style={styles.card}>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={20}
            editable={!user}
            style={styles.input}
          />
          <Pressable accessibilityRole="button" disabled={busy || !identityLoaded} onPress={() => { void createMatch(); }}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>{!identityLoaded || busy ? 'Connecting...' : 'Create Match'}</Text>
          </Pressable>
          <TextInput
            value={matchIdInput}
            onChangeText={setMatchIdInput}
            placeholder="Enter match ID"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Pressable accessibilityRole="button" disabled={busy || !identityLoaded} onPress={() => { void joinMatch(); }}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>{!identityLoaded || busy ? 'Connecting...' : 'Join Match'}</Text>
          </Pressable>
        </View>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>Back to Games</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const turnIndex = match.turn_of_player_indices?.[0];
  const matchStatus = match.status === 'waiting_for_players'
    ? 'Waiting for players to join'
    : match.status === 'over'
      ? match.end_reason === 'player_left' ? 'Match ended when a player left.' : 'Match finished.'
      : turnIndex === playerIndex ? 'Your turn' : 'Opponent’s turn';

  return (
    <View style={styles.gameContent}>
      <Text style={styles.brand}>GamePortal</Text>
      <Text style={styles.title}>{activeGame.name}</Text>
      <Text selectable style={styles.subtitle}>Match ID: {match.id}</Text>
      <Text style={styles.subtitle}>Share this ID with your opponent.</Text>
      <Text style={styles.status}>{matchStatus}{busy ? ' · Saving move…' : ''}</Text>
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      <HostedGameView
        key={`${activeGame.id}:${activeGame.version}`}
        code={activeGame.code}
        stateMessage={gameStateMessage}
        onMove={message => { void handleGameMessage(message); }}
      />
      <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
        <Text style={styles.backText}>Back to Games</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 24, paddingBottom: 48 },
  gameContent: { flex: 1, width: '100%', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, gap: 8 },
  brand: { fontSize: 24, fontWeight: '800', color: '#1e3a8a', marginBottom: 8 },
  title: { fontSize: 30, fontWeight: '700', color: '#172033' },
  subtitle: { fontSize: 15, color: '#64748b', marginTop: 6 },
  description: { fontSize: 15, lineHeight: 23, color: '#64748b', marginTop: 14, marginBottom: 10 },
  status: { fontSize: 18, fontWeight: '700', color: '#172033', marginVertical: 8 },
  card: { gap: 12, marginTop: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#172033' },
  primaryButton: { minHeight: 48, padding: 14, borderRadius: 10, backgroundColor: '#2855c5', alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { minHeight: 48, padding: 14, borderRadius: 10, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 16, fontWeight: '700', color: '#172033' },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  backButton: { minHeight: 48, marginTop: 12, padding: 14, borderRadius: 10, backgroundColor: '#edf1f7', alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 16, fontWeight: '700', color: '#334155' },
  error: { marginTop: 12, color: '#b91c1c', fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
