import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { alarmText } from '../i18n/alarmText';
import type { AGVTelemetry } from '../types/telemetry';
import { colors, minTouchTarget } from '../theme/colors';
import { StatusBadge } from './StatusBadge';

export function AgvDetailModal({ agv, onClose }: { agv: AGVTelemetry | null; onClose: () => void }) {
  const { t } = useTranslation();
  const batteryTone = !agv ? colors.accent : agv.batteryPercent <= 40 ? colors.warning : colors.accent;

  return (
    <Modal visible={agv !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('vehicle.dismiss')}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          {agv ? (
            <>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{agv.id}</Text>
                <StatusBadge status={agv.status} />
              </View>
              <Text style={styles.batteryLabel}>{t('vehicle.battery', { percent: agv.batteryPercent.toFixed(0) })}</Text>
              <View style={styles.batteryTrack}>
                <View style={[styles.batteryFill, { width: `${Math.min(100, agv.batteryPercent)}%`, backgroundColor: batteryTone }]} />
              </View>
              <DetailRow label={t('vehicle.speed')} value={t('vehicle.speedValue', { speed: agv.speed.toFixed(1) })} />
              <DetailRow label={t('vehicle.destination')} value={agv.destination ?? t('vehicle.none')} />
              <DetailRow label={t('vehicle.payload')} value={agv.payloadId ?? t('vehicle.empty')} />
              {agv.errors.map((error) => (
                <Text key={error.id} style={[styles.error, { color: error.severity === 'CRITICAL' ? colors.fault : colors.warning }]}>
                  {t(`severity.${error.severity}`)} · {alarmText(t, error.code, error.message)}
                </Text>
              ))}
              <Pressable style={styles.close} onPress={onClose} accessibilityRole="button">
                <Text style={styles.closeText}>{t('vehicle.close')}</Text>
              </Pressable>
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: colors.border,
    padding: 20,
    gap: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  batteryLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  batteryTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  batteryFill: {
    height: '100%',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 32,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: 15,
  },
  rowValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    fontSize: 14,
    fontWeight: '600',
  },
  close: {
    marginTop: 8,
    minHeight: minTouchTarget,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  closeText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
