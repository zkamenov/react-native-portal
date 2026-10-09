import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Board, Player, createBoard, getResult, getCurrentPlayer } from './ticTacToe';

type OnlineState = {
  roomId: string;
  board: Board;
  currentTurn: Player;
  result: Player | 'draw' | null;
  players: Record<'X' | 'O', string | null>;
  playerNames: Record<'X' | 'O', string | null>;
};

const DEFAULT_SERVER_URL = Platform.OS === 'android' ? 'ws://10.0.2.2:4010' : 'ws://localhost:4010';
const SERVER_URL = (globalThis as any)?.process?.env?.EXPO_PUBLIC_GAME_SERVER_URL ?? DEFAULT_SERVER_URL;

export default function OnlineTicTacToeGame({ onBack }: { onBack: () => void }) {
  const socketRef = useRef<WebSocket | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [displayName, setDisplayName] = useState('Player');
  const [symbol, setSymbol] = useState<Player | null>(null);
  const [state, setState] = useState<OnlineState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState('Connecting to game server...');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const socket = new WebSocket(SERVER_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnectionStatus('Connected');
    };

    socket.onerror = () => {
      setConnectionStatus('Connection failed');
      setErrorMessage('Could not reach the multiplayer server. Check the server URL or start the backend service.');
    };

    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data as string) as {
        type: string;
        roomId?: string;
        symbol?: Player;
        displayName?: string;
        currentTurn?: Player;
        board?: Board;
        result?: Player | 'draw' | null;
        players?: Record<'X' | 'O', string | null>;
        playerNames?: Record<'X' | 'O', string | null>;
        state?: OnlineState;
        message?: string;
      };

      const nextState = payload.state ?? {
        roomId: payload.roomId ?? roomId,
        board: payload.board ?? createBoard(),
        currentTurn: payload.currentTurn ?? 'X',
        result: payload.result ?? null,
        players: payload.players ?? { X: null, O: null },
        playerNames: payload.playerNames ?? { X: null, O: null },
      } as OnlineState;

      if (payload.type === 'joined') {
        setRoomId(payload.roomId ?? null);
        setSymbol(payload.symbol ?? null);
        setDisplayName(payload.displayName ?? displayName);
        setState(payload.state ?? nextState);
        setErrorMessage('');
        return;
      }

      if (payload.type === 'state') {
        setState(nextState);
        setRoomId(payload.roomId ?? roomId);
        setErrorMessage('');
        return;
      }

      if (payload.type === 'error') {
        setErrorMessage(payload.message ?? 'The server rejected that request.');
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, []);

  const board = state?.board ?? createBoard();
  const result = state?.result ?? getResult(board);
  const names = state?.playerNames ?? { X: null, O: null };
  const myName = displayName || 'You';
  const opponentName = symbol ? (symbol === 'X' ? names.O : names.X) ?? 'Opponent' : 'Opponent';
  const opponentSymbol = symbol === 'X' ? 'O' : 'X';
  const isMyTurn = Boolean(symbol && state && state.currentTurn === symbol && state.result === null);
  const statusText = result === null
    ? isMyTurn
      ? `${myName}'s turn`
      : `${opponentName}'s turn`
    : result === 'draw'
      ? "It's a draw!"
      : `${names[result] ?? `Player ${result}`} wins!`;

  function sendMessage(message: Record<string, unknown>) {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setErrorMessage('The server connection is not ready yet.');
      return;
    }
    socketRef.current.send(JSON.stringify(message));
  }

  function createRoom() {
    setErrorMessage('');
    sendMessage({ type: 'create-room', displayName: displayName.trim() || 'Player X' });
  }

  function joinRoom() {
    const cleanedCode = roomCodeInput.trim().toUpperCase();
    if (!cleanedCode) {
      setErrorMessage('Enter a room code to join a match.');
      return;
    }
    setErrorMessage('');
    sendMessage({ type: 'join-room', roomId: cleanedCode, displayName: displayName.trim() || 'Player O' });
  }

  function handleMove(index: number) {
    if (!roomId || !symbol || !isMyTurn || board[index] !== null || result !== null) {
      return;
    }
    sendMessage({ type: 'move', roomId, index });
  }

  function handlePlayAgain() {
    if (!roomId) return;
    sendMessage({ type: 'play-again', roomId });
  }

  if (!roomId || !state) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.brand}>GamePortal</Text>
        <Text style={styles.title}>Online Multiplayer</Text>
        <Text style={styles.subtitle}>Create a new room or join an existing one from another device.</Text>
        <Text style={styles.status}>{connectionStatus}</Text>
        <View style={styles.card}>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Display name"
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={20}
            style={styles.input}
          />
          <Pressable accessibilityRole="button" onPress={createRoom} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Create Room</Text>
          </Pressable>
          <TextInput
            value={roomCodeInput}
            onChangeText={setRoomCodeInput}
            placeholder="Enter room code"
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
          />
          <Pressable accessibilityRole="button" onPress={joinRoom} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
            <Text style={styles.secondaryButtonText}>Join Room</Text>
          </Pressable>
        </View>
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>Back to Games</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.brand}>GamePortal</Text>
      <Text style={styles.title}>Online Tic-Tac-Toe</Text>
      <Text style={styles.subtitle}>Room code: {roomId}</Text>
      <View style={styles.playerRow}>
        <View style={styles.playerCard}>
          <Text style={styles.playerLabel}>You</Text>
          <Text style={styles.playerName}>{myName}</Text>
          <Text style={styles.playerSymbol}>{symbol ?? 'X'}</Text>
        </View>
        <View style={styles.playerCard}>
          <Text style={styles.playerLabel}>Opponent</Text>
          <Text style={styles.playerName}>{opponentName}</Text>
          <Text style={styles.playerSymbol}>{opponentSymbol}</Text>
        </View>
      </View>
      <Text style={styles.status}>{statusText}</Text>
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      <View style={styles.board}>
        {board.map((square, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={`Row ${Math.floor(index / 3) + 1}, column ${index % 3 + 1}: ${square ?? 'empty'}`}
            disabled={square !== null || result !== null || !isMyTurn}
            onPress={() => handleMove(index)}
            style={({ pressed }) => [styles.square, pressed && styles.pressed]}
          >
            <Text style={[styles.mark, square === 'O' && styles.o]}>{square}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={handlePlayAgain} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>Play Again</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
          <Text style={styles.backText}>Back to Games</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', padding: 24, paddingBottom: 48 },
  brand: { fontSize: 24, fontWeight: '800', color: '#1e3a8a', marginBottom: 32 },
  title: { fontSize: 30, fontWeight: '700', color: '#172033' },
  subtitle: { fontSize: 15, color: '#64748b', marginTop: 8 },
  status: { fontSize: 22, fontWeight: '700', color: '#172033', marginVertical: 20 },
  playerRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 4 },
  playerCard: { flex: 1, backgroundColor: '#edf1f7', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#dbe4f0' },
  playerLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', letterSpacing: 1.2, textTransform: 'uppercase' },
  playerName: { fontSize: 18, fontWeight: '700', color: '#172033', marginTop: 6 },
  playerSymbol: { fontSize: 28, fontWeight: '800', color: '#2855c5', marginTop: 4 },
  card: { gap: 12, marginTop: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: '#172033' },
  primaryButton: { minHeight: 48, padding: 14, borderRadius: 10, backgroundColor: '#2855c5', alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { minHeight: 48, padding: 14, borderRadius: 10, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontSize: 16, fontWeight: '700', color: '#172033' },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  backButton: { minHeight: 48, marginTop: 12, padding: 14, borderRadius: 10, backgroundColor: '#edf1f7', alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 16, fontWeight: '700', color: '#334155' },
  board: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, overflow: 'hidden', marginTop: 12 },
  square: { width: '33.333333%', aspectRatio: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  mark: { fontSize: 44, fontWeight: '700', color: '#2855c5' },
  o: { color: '#9a3412' },
  actions: { gap: 12, marginTop: 24 },
  error: { marginTop: 12, color: '#b91c1c', fontSize: 14, fontWeight: '600' },
  pressed: { opacity: 0.8 },
});
