import { Pressable, StyleSheet, Text, View } from 'react-native';
import HostedGameView from '../components/HostedGameView';
import TicTacToeGame from './TicTacToeGame';
import { LocalMatch } from '../portal/matches';
import { BuildplayMatch } from '../portal/buildplayApi';
import { createGameStateMessage } from '../portal/buildplayGameProtocol';

export default function OnlineMatchSnapshot({ match, onBack }: { match: LocalMatch; onBack: () => void }) {
  if (!match.gameCode || !match.gameId || !match.onlineState || match.playerIndex === undefined) {
    return (
      <TicTacToeGame
        onBack={onBack}
        readOnlyMatch={{ id: match.serverMatchId ?? match.id, board: match.board }}
      />
    );
  }

  const onlineMatch = match.onlineState as BuildplayMatch;
  const hasPlayers = Array.isArray(onlineMatch.players);
  if (!hasPlayers || typeof onlineMatch.status !== 'string') {
    return (
      <View style={styles.content}>
        <Text style={styles.brand}>GamePortal</Text>
        <Text style={styles.title}>{match.gameName}</Text>
        <Text style={styles.subtitle}>This saved online match snapshot is invalid.</Text>
        <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>Back to My Matches</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <Text style={styles.brand}>GamePortal</Text>
      <Text style={styles.title}>{match.gameName}</Text>
      <Text selectable style={styles.subtitle}>Online match {match.serverMatchId} · saved offline</Text>
      <Text style={styles.subtitle}>Offline snapshot · reconnect to buildplay.fun to continue playing.</Text>
      <HostedGameView
        key={`${match.gameId}:${match.gameVersion}`}
        code={match.gameCode}
        stateMessage={createGameStateMessage(onlineMatch, match.playerIndex, match.allowedPlayerCounts)}
        readOnly
        onMove={() => {}}
      />
      <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
        <Text style={styles.backText}>Back to My Matches</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, width: '100%', paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, gap: 8 },
  brand: { fontSize: 24, fontWeight: '800', color: '#1e3a8a', marginBottom: 8 },
  title: { fontSize: 30, fontWeight: '700', color: '#172033' },
  subtitle: { fontSize: 15, color: '#64748b', marginTop: 6 },
  backButton: { minHeight: 48, marginTop: 12, padding: 14, borderRadius: 10, backgroundColor: '#edf1f7', alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 16, fontWeight: '700', color: '#334155' },
  pressed: { opacity: 0.8 },
});
