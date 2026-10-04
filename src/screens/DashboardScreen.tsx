import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MetricCard } from '../components/MetricCard';
import { useFleet, type FleetEvent } from '../hooks/useFleetTelemetry';
import type { AGVTelemetry } from '../types/telemetry';
import type { ConnectionState } from '../services/FleetDataSource';
import { colors, minTouchTarget } from '../theme/colors';

function activeZone(fleet: AGVTelemetry[]): string {
  if (fleet.length === 0) {
    return '—';
  }
  const west = fleet.filter((agv) => agv.pose.x < 50).length;
  return west >= fleet.length - west ? 'WEST' : 'EAST';
}

function latencyLabel(connection: ConnectionState): string {
  if (connection.status === 'offline') {
    return 'OFFLINE';
  }
  if (connection.status === 'connecting') {
    return 'LINK';
  }
  if (connection.latencyMs === null) {
    return 'LIVE';
  }
  return `${Math.round(connection.latencyMs)} ms`;
}

function latencyColor(connection: ConnectionState): string {
  if (connection.status === 'offline') {
    return colors.fault;
  }
  if (connection.status === 'connecting' || (connection.latencyMs !== null && connection.latencyMs > 150)) {
    return colors.warning;
  }
  return colors.accent;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function eventColor(event: FleetEvent): string {
  if (event.severity === 'CRITICAL') {
    return colors.fault;
  }
  if (event.severity === 'WARNING') {
    return colors.warning;
  }
  return colors.path;
}

export function DashboardScreen() {
  const { fleet, connection, events, triggerEmergencyStop, releaseEmergencyStop } = useFleet();
  const estopped = fleet.length > 0 && fleet.every((agv) => agv.status === 'ESTOP');
  const active = fleet.filter((agv) => agv.status === 'NAVIGATING' || agv.status === 'IDLE').length;
  const charging = fleet.filter((agv) => agv.status === 'CHARGING').length;
  const faulted = fleet.filter((agv) => agv.status === 'FAULT' || agv.status === 'ESTOP').length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View style={[styles.pill, { borderColor: latencyColor(connection) }]}>
          <Text style={[styles.pillText, { color: latencyColor(connection) }]}>{latencyLabel(connection)}</Text>
        </View>
        <View style={styles.zone}>
          <Text style={styles.zoneLabel}>ACTIVE ZONE</Text>
          <Text style={styles.zoneValue}>{activeZone(fleet)}</Text>
        </View>
        <Pressable
          style={[styles.estop, estopped ? styles.release : null]}
          onPress={() => void (estopped ? releaseEmergencyStop() : triggerEmergencyStop())}
          accessibilityRole="button"
          accessibilityLabel={estopped ? 'Release emergency stop' : 'Emergency stop'}
        >
          <Text style={[styles.estopText, estopped ? styles.releaseText : null]}>{estopped ? 'RELEASE' : 'E-STOP'}</Text>
        </Pressable>
      </View>

      <View style={styles.metrics}>
        <MetricCard label="Active" value={active} tone={colors.accent} />
        <MetricCard label="Charging" value={charging} tone={colors.path} />
        <MetricCard label="Faulted" value={faulted} tone={colors.fault} />
      </View>

      <Text style={styles.section}>Recent activity</Text>
      {events.length === 0 ? <Text style={styles.empty}>Waiting for fleet activity</Text> : null}
      {events.map((event) => (
        <View key={event.id} style={[styles.event, { borderLeftColor: eventColor(event) }]}>
          <Text style={styles.eventText}>{event.message}</Text>
          <Text style={styles.eventTime}>{formatTime(event.timestamp)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    gap: 12,
    paddingBottom: 28,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pill: {
    minHeight: minTouchTarget,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '700',
  },
  zone: {
    flex: 1,
    minHeight: minTouchTarget,
    justifyContent: 'center',
  },
  zoneLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  zoneValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  estop: {
    minHeight: minTouchTarget,
    minWidth: 112,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.fault,
  },
  release: {
    backgroundColor: colors.warning,
  },
  estopText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  releaseText: {
    color: colors.ink,
  },
  metrics: {
    flexDirection: 'row',
    gap: 10,
  },
  section: {
    marginTop: 8,
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  empty: {
    color: colors.textMuted,
    fontSize: 15,
  },
  event: {
    backgroundColor: colors.surface,
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  eventText: {
    color: colors.text,
    fontSize: 15,
  },
  eventTime: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
});
