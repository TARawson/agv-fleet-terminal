import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { alarmText } from '../i18n/alarmText';
import { useFleet, useFleetTelemetry } from '../hooks/useFleetTelemetry';
import type { AlarmSeverity } from '../types/telemetry';
import { colors, minTouchTarget } from '../theme/colors';

type AlarmFilter = 'ALL' | AlarmSeverity;

const FILTERS: AlarmFilter[] = ['ALL', 'WARNING', 'CRITICAL'];

interface AlarmRow {
  agvId: string;
  errorId: string;
  code: string;
  message: string;
  severity: AlarmSeverity;
  timestamp: number;
}

function formatTime(timestamp: number, language: string): string {
  return new Date(timestamp).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AlarmLogScreen() {
  const { t, i18n } = useTranslation();
  const fleet = useFleetTelemetry();
  const { acknowledgeError } = useFleet();
  const [filter, setFilter] = useState<AlarmFilter>('ALL');
  const alarms: AlarmRow[] = fleet.flatMap((agv) =>
    agv.errors.map((error) => ({
      agvId: agv.id,
      errorId: error.id,
      code: error.code,
      message: error.message,
      severity: error.severity,
      timestamp: error.timestamp,
    })),
  );
  const visible = alarms.filter((alarm) => filter === 'ALL' || alarm.severity === filter);

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={visible}
      keyExtractor={(item) => `${item.agvId}-${item.errorId}`}
      ListHeaderComponent={
        <View style={styles.filters}>
          {FILTERS.map((item) => {
            const selected = item === filter;
            return (
              <Pressable
                key={item}
                style={[styles.filter, selected ? styles.filterSelected : null]}
                onPress={() => setFilter(item)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.filterText, selected ? styles.filterTextSelected : null]}>
                  {item === 'ALL' ? t('alarms.all') : t(`severity.${item}`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>{t('alarms.empty')}</Text>}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.copy}>
            <Text style={[styles.severity, { color: item.severity === 'CRITICAL' ? colors.fault : colors.warning }]}>
              {t(`severity.${item.severity}`)} · {item.agvId}
            </Text>
            <Text style={styles.message}>{alarmText(t, item.code, item.message)}</Text>
            <Text style={styles.meta}>
              {item.code} · {formatTime(item.timestamp, i18n.language)}
            </Text>
          </View>
          <Pressable
            style={styles.clear}
            onPress={() => void acknowledgeError(item.agvId, item.errorId)}
            accessibilityRole="button"
            accessibilityLabel={t('alarms.clearLabel', { code: item.code, id: item.agvId })}
          >
            <Text style={styles.clearText}>{t('alarms.clear')}</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 16,
    gap: 10,
    paddingBottom: 28,
  },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  filter: {
    flex: 1,
    minHeight: minTouchTarget,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSelected: {
    borderColor: colors.path,
    backgroundColor: colors.chargeFill,
  },
  filterText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  filterTextSelected: {
    color: colors.path,
  },
  empty: {
    color: colors.textMuted,
    fontSize: 16,
    paddingVertical: 24,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  copy: {
    flex: 1,
    gap: 4,
  },
  severity: {
    fontSize: 13,
    fontWeight: '800',
  },
  message: {
    color: colors.text,
    fontSize: 15,
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  clear: {
    minHeight: minTouchTarget,
    minWidth: 88,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
});
