import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LocalMatch, matchStatusLabel } from '../portal/matches';

type Props = { matches: LocalMatch[]; onOpen: (id: string) => void };

export default function MyMatchesScreen({ matches, onOpen }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">My Matches</Text>
      <Text style={styles.note}>Games saved on this device. Online matches show their latest saved snapshot.</Text>
      {(['active', 'finished'] as const).map(status => {
        const section = matches.filter(match => match.status === status);
        return (
          <View key={status} style={styles.section}>
            <Text style={styles.heading} accessibilityRole="header">{status.toUpperCase()}</Text>
            {section.length === 0 && <Text style={styles.note}>No {status} matches yet.</Text>}
            {section.map(match => (
              <Pressable key={match.id} accessibilityRole="button" onPress={() => onOpen(match.id)}
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}>
                <Text style={styles.name}>{match.gameName}</Text>
                <Text style={styles.note}>{match.source === 'online'
                  ? `Online match ${match.serverMatchId} · saved offline`
                  : `Match ${match.id}`}</Text>
                <Text style={styles.status}>{matchStatusLabel(match)}</Text>
              </Pressable>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 24, paddingBottom: 48 },
  title: { fontSize: 30, fontWeight: '700', color: '#172033', marginBottom: 12 },
  note: { fontSize: 15, lineHeight: 23, color: '#64748b' },
  section: { marginTop: 28, gap: 12 },
  heading: { fontSize: 12, fontWeight: '700', letterSpacing: 2, color: '#64748b' },
  card: { padding: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, gap: 8 },
  name: { fontSize: 21, fontWeight: '700', color: '#172033' },
  status: { fontSize: 16, fontWeight: '600', color: '#1e3a8a' },
});
