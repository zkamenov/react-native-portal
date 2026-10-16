import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Board, chooseComputerMove, createBoard, getCurrentPlayer, getResult, playMove } from './ticTacToe';

type Props = {
  onBack: () => void;
  mode?: 'local' | 'computer';
  localMatch?: { id: string; board: Board; onMove: (index: number) => void; onPlayAgain: () => void };
  readOnlyMatch?: { id: string; board: Board };
};

export default function TicTacToeGame({ onBack, mode = 'local', localMatch, readOnlyMatch }: Props) {
  const [internalBoard, setBoard] = useState(createBoard);
  const board = readOnlyMatch?.board ?? localMatch?.board ?? internalBoard;
  const result = getResult(board);
  const computerTurn = mode === 'computer' && result === null && getCurrentPlayer(board) === 'O';
  const status = result === 'draw'
    ? "It's a draw!"
    : mode === 'computer'
      ? result === 'X' ? 'You win!' : result === 'O' ? 'Computer wins!'
        : computerTurn ? 'Computer is thinking...' : 'Your turn'
      : result ? `Player ${result} wins!` : `Player ${getCurrentPlayer(board)}'s turn`;

  useEffect(() => {
    if (!computerTurn) return;
    const timer = setTimeout(() => {
      if (localMatch) {
        const index = chooseComputerMove(board);
        if (index !== null) localMatch.onMove(index);
        return;
      }
      setBoard(current => {
        // Ignore a stale callback after Play Again.
        if (current !== board) return current;
        const index = chooseComputerMove(current);
        return index === null ? current : playMove(current, index);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [board, computerTurn, localMatch]);

  function handleMove(index: number) {
    if (localMatch) { localMatch.onMove(index); return; }
    setBoard(current => {
      if (mode === 'computer' && getCurrentPlayer(current) !== 'X') return current;
      return playMove(current, index);
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.brand}>GamePortal</Text>
      <Text style={styles.title} accessibilityRole="header">Tic-Tac-Toe</Text>
      <Text style={styles.subtitle}>{mode === 'computer' ? 'Vs Computer · You are X, computer is O' : 'Local 2 Players · Share this device'}</Text>
      {localMatch && <Text style={styles.subtitle}>Match {localMatch.id}</Text>}
      {readOnlyMatch && <Text style={styles.subtitle}>Online match {readOnlyMatch.id} · saved on this device</Text>}
      {readOnlyMatch && <Text style={styles.subtitle}>Offline snapshot · reconnect to buildplay.fun to continue playing.</Text>}
      <Text style={styles.status} accessibilityLiveRegion="polite">{status}</Text>
      <View style={styles.board}>
        {board.map((square, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={`Row ${Math.floor(index / 3) + 1}, column ${index % 3 + 1}: ${square ?? 'empty'}`}
            disabled={Boolean(readOnlyMatch) || square !== null || result !== null || computerTurn}
            onPress={() => handleMove(index)}
            style={({ pressed }) => [styles.square, pressed && styles.pressed]}
          >
            <Text style={[styles.mark, square === 'O' && styles.o]}>{square}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        {!readOnlyMatch && (
          <Pressable accessibilityRole="button" onPress={() => localMatch ? localMatch.onPlayAgain() : setBoard(createBoard())}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
            <Text style={styles.buttonText}>Play Again</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={onBack}
          style={({ pressed }) => [styles.button, styles.back, pressed && styles.pressed]}>
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
  subtitle: { fontSize: 15, color: '#64748b', marginTop: 10 },
  status: { fontSize: 22, fontWeight: '700', color: '#172033', marginVertical: 28 },
  board: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, overflow: 'hidden' },
  square: { width: '33.333333%', aspectRatio: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  mark: { fontSize: 44, fontWeight: '700', color: '#2855c5' },
  o: { color: '#9a3412' },
  actions: { gap: 12, marginTop: 24 },
  button: { minHeight: 48, padding: 14, borderRadius: 10, backgroundColor: '#2855c5', alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  back: { backgroundColor: '#edf1f7' },
  backText: { fontSize: 16, fontWeight: '700', color: '#334155' },
  pressed: { opacity: 0.8 },
});
