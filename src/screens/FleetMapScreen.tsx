import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AgvDetailModal } from '../components/AgvDetailModal';
import { WarehouseCanvas } from '../components/WarehouseCanvas';
import { useFleetTelemetry } from '../hooks/useFleetTelemetry';
import { WAREHOUSE_BOUNDS } from '../types/telemetry';
import type { AGVStatus } from '../types/telemetry';
import { colors, statusColor } from '../theme/colors';

const LEGEND: AGVStatus[] = ['NAVIGATING', 'CHARGING', 'FAULT'];

export function FleetMapScreen() {
  const fleet = useFleetTelemetry();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const selected = fleet.find((agv) => agv.id === selectedId) ?? null;
  const aspect = WAREHOUSE_BOUNDS.maxX / WAREHOUSE_BOUNDS.maxY;
  let drawWidth = box.width;
  let drawHeight = box.width / aspect;
  if (box.height > 0 && drawHeight > box.height) {
    drawHeight = box.height;
    drawWidth = box.height * aspect;
  }

  return (
    <View style={styles.screen}>
      <View
        style={styles.stage}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setBox((current) => (current.width === width && current.height === height ? current : { width, height }));
        }}
      >
        {drawWidth > 0 && drawHeight > 0 ? (
          <WarehouseCanvas
            width={drawWidth}
            height={drawHeight}
            fleet={fleet}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        ) : null}
      </View>
      <View style={styles.legend}>
        {LEGEND.map((status) => (
          <View key={status} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: statusColor(status) }]} />
            <Text style={styles.legendText}>{status}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.hint}>Tap a vehicle for live diagnostics</Text>
      <AgvDetailModal agv={selected} onClose={() => setSelectedId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
    gap: 12,
  },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
});
