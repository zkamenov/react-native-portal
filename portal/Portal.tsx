import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import DiscoverScreen from '../screens/DiscoverScreen';
import MyMatchesScreen from '../screens/MyMatchesScreen';
import ModeSelection from '../components/ModeSelection';
import TicTacToeGame from '../games/TicTacToeGame';
import OnlineBuildplayGame from '../games/OnlineBuildplayGame';
import OfflineBuildplayGame from '../games/OfflineBuildplayGame';
import OnlineMatchSnapshot from '../games/OnlineMatchSnapshot';
import OpenGamesScreen from '../screens/OpenGamesScreen';
import BuildPlayScreen from '../screens/BuildPlayScreen';
import OfflineStatus from '../components/OfflineStatus';
import useLocalMatches from './useLocalMatches';
import { BuildplayGame } from './buildplayApi';

export default function Portal() {
  const [tab, setTab] = useState<'discover' | 'openGames' | 'matches' | 'buildplay'>('discover');
  const [search, setSearch] = useState('');
  const { matches, loaded, loadError, saveStatus, retryLoad, startMatch, move, saveOnlineMatch } = useLocalMatches();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offlineGame, setOfflineGame] = useState<BuildplayGame | null>(null);
  const [onlineGame, setOnlineGame] = useState(false);
  const [joinMatchId, setJoinMatchId] = useState<string | undefined>();
  const [resumeMatchId, setResumeMatchId] = useState<string | undefined>();
  const [showModes, setShowModes] = useState(false);
  const [selectedGame, setSelectedGame] = useState<BuildplayGame | null>(null);
  const [selectedGameDownloaded, setSelectedGameDownloaded] = useState(false);

  const selectedMatch = matches.find(match => match.id === selectedId);

  function startLocalMatch(mode: 'local' | 'computer' = 'local') {
    setSelectedId(startMatch(mode));
    setOfflineGame(null);
    setOnlineGame(false);
    setJoinMatchId(undefined);
    setResumeMatchId(undefined);
    setShowModes(false);
  }

  function leaveGame() {
    setSelectedId(null);
    setOfflineGame(null);
    setOnlineGame(false);
    setJoinMatchId(undefined);
    setResumeMatchId(undefined);
  }

  function openMatch(id: string) {
    const match = matches.find(item => item.id === id);
    if (match?.source === 'online' && match.status === 'active'
      && match.serverStatus !== 'over' && match.gameId && match.gameVersion !== undefined
      && match.gameCode && match.serverMatchId) {
      setSelectedId(null);
      setOfflineGame(null);
      setSelectedGame({
        id: match.gameId,
        version: match.gameVersion,
        name: match.gameName,
        description: '',
        allowed_player_counts: match.allowedPlayerCounts ?? [],
        allows_leave_mid_match: false,
        allows_join_mid_match: false,
        code: match.gameCode,
      });
      setResumeMatchId(match.serverMatchId);
      setJoinMatchId(undefined);
      setOnlineGame(true);
    } else {
      setSelectedId(id);
    }
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
        {(['discover', 'openGames', 'matches', 'buildplay'] as const).map(destination => (
          <Pressable key={destination} accessibilityRole="button"
            accessibilityState={{ selected: tab === destination }}
            onPress={() => { leaveGame(); setShowModes(false); setTab(destination); }}
            style={[styles.tab, tab === destination && styles.selected]}>
            <Text style={[styles.label, tab === destination && styles.selectedLabel]}>
              {destination === 'discover' ? 'Discover'
                : destination === 'openGames' ? 'Join a Game'
                  : destination === 'matches' ? 'My Matches' : 'BuildPlay Offline'}
            </Text>
          </Pressable>
        ))}
      </View>
      <OfflineStatus />
      <Text accessibilityLiveRegion="polite" style={{ paddingHorizontal: 24, color: '#64748b' }}>
        {saveStatus === 'saving' ? 'Saving matches...' : saveStatus === 'error'
          ? 'Could not save matches. Keep the app open; your next move will retry.' : 'Matches saved on this device.'}
      </Text>
      {selectedMatch ? (
        selectedMatch.source === 'online' ? (
          <OnlineMatchSnapshot key={selectedMatch.id} match={selectedMatch} onBack={leaveGame} />
        ) : (
            <TicTacToeGame key={selectedMatch.id} mode={selectedMatch.mode ?? 'local'} onBack={leaveGame}
              localMatch={{
                id: selectedMatch.id,
                board: selectedMatch.board,
                onMove: index => move(selectedMatch.id, index),
                onPlayAgain: () => setSelectedId(startMatch(selectedMatch.mode ?? 'local')),
              }} />
          )
        ) : offlineGame ? (
        <OfflineBuildplayGame game={offlineGame} onBack={leaveGame} />
      ) : onlineGame ? (
        selectedGame ? <OnlineBuildplayGame game={selectedGame} onBack={leaveGame} onSaveMatch={saveOnlineMatch}
          joinMatchId={joinMatchId} resumeMatchId={resumeMatchId} /> : null
      ) : tab === 'discover' ? (
        <DiscoverScreen search={search} onSearch={setSearch} onChooseGame={(game, downloaded) => {
          setSelectedGame(game);
          setSelectedGameDownloaded(downloaded);
          setShowModes(true);
        }} />
      ) : tab === 'openGames' ? (
        <OpenGamesScreen onJoin={(game, matchId) => {
          setSelectedGame(game);
          setJoinMatchId(matchId);
          setOnlineGame(true);
        }} />
      ) : tab === 'matches' ? (
        <MyMatchesScreen matches={matches} onOpen={openMatch} />
      ) : (
        <BuildPlayScreen />
      )}
      <ModeSelection visible={showModes} game={selectedGame} downloaded={selectedGameDownloaded} onClose={() => setShowModes(false)}
        onLocal={startLocalMatch}
        onComputer={() => {
          setShowModes(false);
          if (selectedGame?.id === 'tictactoe') startLocalMatch('computer');
          else if (selectedGame && selectedGameDownloaded) setOfflineGame(selectedGame);
        }}
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
