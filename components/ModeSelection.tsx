import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = {
  visible: boolean;
  onLocal: () => void;
  onComputer: () => void;
  onOnline: () => void;
  onClose: () => void;
};

export default function ModeSelection({ visible, onLocal, onComputer, onOnline, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title} accessibilityRole="header">Choose Mode</Text>
            <Text style={styles.subtitle}>Tic-Tac-Toe</Text>
            <Pressable accessibilityRole="button" onPress={onLocal}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>Local 2 Players</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onComputer}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>Vs Computer</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onOnline}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
              <Text style={styles.buttonText}>Online Multiplayer</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={onClose}
              style={({ pressed }) => [styles.button, styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.disabledText}>Back to Games</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  panel: { width: '100%', maxWidth: 400, maxHeight: '90%', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  content: { padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', color: '#172033' },
  subtitle: { fontSize: 16, color: '#64748b', marginBottom: 8 },
  button: { minHeight: 48, padding: 14, borderRadius: 10, backgroundColor: '#2855c5', alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  disabled: { backgroundColor: '#edf1f7' },
  disabledText: { fontSize: 16, fontWeight: '700', color: '#64748b' },
  comingSoon: { fontSize: 13, color: '#64748b', marginTop: 4 },
  pressed: { opacity: 0.8 },
});

