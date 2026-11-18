import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MetricCard } from '../components/MetricCard';
import { alarmText } from '../i18n/alarmText';
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

function latencyLabel(connection: ConnectionState, t: TFunction): string {
  if (connection.status === 'offline') {
    return t('link.OFFLINE');
  }
  if (connection.status === 'connecting') {
    return t('link.connecting');
  }
  if (connection.latencyMs === null) {
    return t('link.live');
  }
  return t('link.latency', { ms: Math.round(connection.latencyMs) });
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

function formatTime(timestamp: number, language: string): string {
  return new Date(timestamp).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function eventMessage(event: FleetEvent, t: TFunction): string {
  const params = { ...event.messageParams };
  if (params.place === '') {
    params.place = t('events.waypoint');
  }
  if (typeof params.code === 'string') {
    params.message = alarmText(t, params.code, String(params.message ?? ''));
  }
  return t(event.messageKey, params);
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
  const { t, i18n } = useTranslation();
  const { fleet, connection, events, triggerEmergencyStop, releaseEmergencyStop } = useFleet();
  const estopped = fleet.length > 0 && fleet.every((agv) => agv.status === 'ESTOP');
  const active = fleet.filter((agv) => agv.status === 'NAVIGATING' || agv.status === 'IDLE').length;
  const charging = fleet.filter((agv) => agv.status === 'CHARGING').length;
  const faulted = fleet.filter((agv) => agv.status === 'FAULT' || agv.status === 'ESTOP').length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <View style={[styles.pill, { borderColor: latencyColor(connection) }]}>
          <Text style={[styles.pillText, { color: latencyColor(connection) }]}>{latencyLabel(connection, t)}</Text>
        </View>
        <View style={styles.zone}>
          <Text style={styles.zoneLabel}>{t('zone.label')}</Text>
          <Text style={styles.zoneValue}>{t(`zone.${activeZone(fleet)}`, { defaultValue: t('zone.none') })}</Text>
        </View>
        <Pressable
          style={[styles.estop, estopped ? styles.release : null]}
          onPress={() => void (estopped ? releaseEmergencyStop() : triggerEmergencyStop())}
          accessibilityRole="button"
          accessibilityLabel={estopped ? t('dashboard.releaseLabel') : t('dashboard.estopLabel')}
        >
          <Text style={[styles.estopText, estopped ? styles.releaseText : null]}>
            {estopped ? t('dashboard.release') : t('dashboard.estop')}
          </Text>
        </Pressable>
      </View>

      <View style={styles.metrics}>
        <MetricCard label={t('dashboard.active')} value={active} tone={colors.accent} />
        <MetricCard label={t('dashboard.charging')} value={charging} tone={colors.path} />
        <MetricCard label={t('dashboard.faulted')} value={faulted} tone={colors.fault} />
      </View>

      <Text style={styles.section}>{t('dashboard.recent')}</Text>
      {events.length === 0 ? <Text style={styles.empty}>{t('dashboard.waiting')}</Text> : null}
      {events.map((event) => (
        <View key={event.id} style={[styles.event, { borderLeftColor: eventColor(event) }]}>
          <Text style={styles.eventText}>{eventMessage(event, t)}</Text>
          <Text style={styles.eventTime}>{formatTime(event.timestamp, i18n.language)}</Text>
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
