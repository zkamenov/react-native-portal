import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DiscoverScreen from '../screens/DiscoverScreen';
import MyMatchesScreen from '../screens/MyMatchesScreen';
import ModeSelection from '../components/ModeSelection';
import TicTacToeGame from '../games/TicTacToeGame';
import OnlineTicTacToeGame from '../games/OnlineTicTacToeGame';
import useLocalMatches from './useLocalMatches';

export default function Portal() {
  const [tab, setTab] = useState<'discover' | 'matches'>('discover');
  const [search, setSearch] = useState('');
  const { matches, loaded, loadError, saveStatus, retryLoad, startMatch, move } = useLocalMatches();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [computerGame, setComputerGame] = useState(false);
  const [onlineGame, setOnlineGame] = useState(false);
  const [showModes, setShowModes] = useState(false);

  const selectedMatch = matches.find(match => match.id === selectedId);

  function startLocalMatch() {
    setSelectedId(startMatch());
    setComputerGame(false);
    setOnlineGame(false);
    setShowModes(false);
  }

  function leaveGame() {
    setSelectedId(null);
    setComputerGame(false);
    setOnlineGame(false);
  }

  if (!loaded) {
    return (
      <View style={{ padding: 24, gap: 12 }}>
        <Text>{loadError ? 'Could not load saved matches. Please try again.' : 'Loading saved matches...'}</Text>
        {loadError && (
          <Pressable accessibilityRole="button" onPress={retryLoad} style={styles.tab}>
            <Text style={styles.label}>Try again</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.navigation}>
        {(['discover', 'matches'] as const).map(destination => (
          <Pressable key={destination} accessibilityRole="button"
            accessibilityState={{ selected: tab === destination }}
            onPress={() => { leaveGame(); setShowModes(false); setTab(destination); }}
            style={[styles.tab, tab === destination && styles.selected]}>
            <Text style={[styles.label, tab === destination && styles.selectedLabel]}>
              {destination === 'discover' ? 'Discover' : 'My Matches'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={{ paddingHorizontal: 24, color: '#64748b' }}>
        {saveStatus === 'saving' ? 'Saving matches...' : saveStatus === 'error'
          ? 'Could not save matches. Keep the app open; your next move will retry.' : 'Matches saved on this device.'}
      </Text>
      {selectedMatch ? (
        <TicTacToeGame key={selectedMatch.id} mode="local" onBack={leaveGame}
          localMatch={{
            id: selectedMatch.id,
            board: selectedMatch.board,
            onMove: index => move(selectedMatch.id, index),
            onPlayAgain: startLocalMatch,
          }} />
      ) : computerGame ? (
        <TicTacToeGame mode="computer" onBack={leaveGame} />
      ) : onlineGame ? (
        <OnlineTicTacToeGame onBack={leaveGame} />
      ) : tab === 'discover' ? (
        <DiscoverScreen search={search} onSearch={setSearch} onChooseMode={() => setShowModes(true)} />
      ) : (
        <MyMatchesScreen matches={matches} onOpen={setSelectedId} />
      )}
      <ModeSelection visible={showModes} onClose={() => setShowModes(false)}
        onLocal={startLocalMatch}
        onComputer={() => { setShowModes(false); setComputerGame(true); }}
        onOnline={() => { setShowModes(false); setOnlineGame(true); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  navigation: { width: '100%', maxWidth: 1000, alignSelf: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  tab: { minHeight: 48, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 10, backgroundColor: '#edf1f7' },
  selected: { backgroundColor: '#2855c5' },
  label: { fontSize: 15, fontWeight: '700', color: '#334155' },
  selectedLabel: { color: '#fff' },
});


