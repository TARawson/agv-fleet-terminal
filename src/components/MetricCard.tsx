import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function MetricCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.card}>
      <Text style={[styles.value, { color: tone }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 10,
    minHeight: 88,
  },
  value: {
    fontSize: 28,
    fontWeight: '700',
  },
  label: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
