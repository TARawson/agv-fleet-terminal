import { StyleSheet, Text, View } from 'react-native';
import type { AGVStatus } from '../types/telemetry';
import { statusColor } from '../theme/colors';

export function StatusBadge({ status }: { status: AGVStatus }) {
  const color = statusColor(status);
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.text, { color }]}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
