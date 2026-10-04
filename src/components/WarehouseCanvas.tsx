import { Pressable, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Circle, G, Line, Rect, Svg, Text as SvgText } from 'react-native-svg';
import type { AGVTelemetry } from '../types/telemetry';
import { WAREHOUSE_BOUNDS } from '../types/telemetry';
import { WAYPOINTS, type WaypointName } from '../types/waypoints';
import { colors, statusColor } from '../theme/colors';

interface WarehouseCanvasProps {
  fleet: AGVTelemetry[];
  width: number;
  height: number;
  selectedId: string | null;
  onSelect: (agvId: string) => void;
}

const HIT_RADIUS = 9;

/** Drawn beside the route so shared aisles do not stack the markers. */
const LANE_OFFSET: Record<string, number> = {
  'AGV-01': -3.2,
  'AGV-02': -1.1,
  'AGV-03': 1.1,
  'AGV-04': 3.2,
};

function toSvgY(y: number): number {
  return WAREHOUSE_BOUNDS.maxY - y;
}

function markerPoint(agv: AGVTelemetry): { x: number; y: number } {
  const lane = LANE_OFFSET[agv.id] ?? 0;
  const offsetX = -Math.sin(agv.pose.theta) * lane;
  const offsetY = Math.cos(agv.pose.theta) * lane;
  return {
    x: agv.pose.x + offsetX,
    y: toSvgY(agv.pose.y + offsetY),
  };
}

function pressPoint(event: GestureResponderEvent, width: number, height: number): { x: number; y: number } | null {
  if (width <= 0 || height <= 0) {
    return null;
  }
  const native = event.nativeEvent as GestureResponderEvent['nativeEvent'] & {
    offsetX?: number;
    offsetY?: number;
    clientX?: number;
    clientY?: number;
  };
  const click = event as GestureResponderEvent & {
    offsetX?: number;
    offsetY?: number;
    clientX?: number;
    clientY?: number;
    currentTarget?: { getBoundingClientRect?: () => { left: number; top: number; width: number; height: number } };
  };
  let localX: number | undefined = native.locationX;
  let localY: number | undefined = native.locationY;
  if (typeof localX !== 'number' || typeof localY !== 'number') {
    localX = native.offsetX ?? click.offsetX;
    localY = native.offsetY ?? click.offsetY;
  }
  if ((typeof localX !== 'number' || typeof localY !== 'number') && click.currentTarget?.getBoundingClientRect) {
    const rect = click.currentTarget.getBoundingClientRect();
    const clientX = native.clientX ?? click.clientX;
    const clientY = native.clientY ?? click.clientY;
    if (typeof clientX === 'number' && typeof clientY === 'number' && rect.width > 0 && rect.height > 0) {
      localX = ((clientX - rect.left) / rect.width) * width;
      localY = ((clientY - rect.top) / rect.height) * height;
    }
  }
  if (typeof localX !== 'number' || typeof localY !== 'number') {
    return null;
  }
  return {
    x: (localX / width) * WAREHOUSE_BOUNDS.maxX,
    y: (localY / height) * WAREHOUSE_BOUNDS.maxY,
  };
}

function vehicleAt(fleet: AGVTelemetry[], svgX: number, svgY: number): string | null {
  let closest: { id: string; distance: number } | null = null;
  for (const agv of fleet) {
    const point = markerPoint(agv);
    const distance = Math.hypot(point.x - svgX, point.y - svgY);
    if (distance <= HIT_RADIUS && (closest === null || distance < closest.distance)) {
      closest = { id: agv.id, distance };
    }
  }
  return closest?.id ?? null;
}

function stationRect(name: WaypointName, stationWidth: number, stationHeight: number) {
  const point = WAYPOINTS[name];
  return {
    x: point.x - stationWidth / 2,
    y: toSvgY(point.y + stationHeight / 2),
    width: stationWidth,
    height: stationHeight,
  };
}

export function WarehouseCanvas({ fleet, width, height, selectedId, onSelect }: WarehouseCanvasProps) {
  const aisles: WaypointName[] = ['AISLE-1', 'AISLE-2', 'AISLE-3', 'AISLE-4'];
  const picks: WaypointName[] = ['PICK-A', 'PICK-B'];
  const chargers: WaypointName[] = ['CHARGE-1', 'CHARGE-2'];

  function selectAt(event: GestureResponderEvent) {
    const point = pressPoint(event, width, height);
    if (!point) {
      return;
    }
    const agvId = vehicleAt(fleet, point.x, point.y);
    if (agvId) {
      onSelect(agvId);
    }
  }

  return (
    <View style={[styles.frame, { width, height }]}>
    <Svg width={width} height={height} viewBox={`0 0 ${WAREHOUSE_BOUNDS.maxX} ${WAREHOUSE_BOUNDS.maxY}`}>
      <Rect x={0} y={0} width={100} height={60} fill={colors.surface} />
      {[20, 40, 60, 80].map((x) => (
        <Line key={`vx-${x}`} x1={x} y1={0} x2={x} y2={60} stroke={colors.border} strokeWidth={0.15} />
      ))}
      {[20, 40].map((y) => (
        <Line key={`hy-${y}`} x1={0} y1={y} x2={100} y2={y} stroke={colors.border} strokeWidth={0.15} />
      ))}

      <Rect x={42} y={toSvgY(7)} width={16} height={7} rx={0.6} fill={colors.rack} stroke={colors.textMuted} strokeWidth={0.35} />
      <SvgText x={50} y={toSvgY(3.2)} fill={colors.textMuted} fontSize={2.4} textAnchor="middle">
        DOCK
      </SvgText>

      {aisles.map((name) => (
        <Rect key={name} {...stationRect(name, 8, 8)} rx={0.4} fill={colors.rack} stroke={colors.border} strokeWidth={0.35} />
      ))}
      {picks.map((name) => (
        <G key={name}>
          <Rect {...stationRect(name, 12, 8)} rx={0.6} fill={colors.pickFill} stroke={colors.accent} strokeWidth={0.4} />
          <SvgText x={WAYPOINTS[name].x} y={toSvgY(WAYPOINTS[name].y) + 0.8} fill={colors.accent} fontSize={2.3} textAnchor="middle">
            {name}
          </SvgText>
        </G>
      ))}
      {chargers.map((name) => (
        <G key={name}>
          <Rect {...stationRect(name, 10, 7)} rx={0.6} fill={colors.chargeFill} stroke={colors.path} strokeWidth={0.4} />
          <SvgText x={WAYPOINTS[name].x} y={toSvgY(WAYPOINTS[name].y) + 0.8} fill={colors.path} fontSize={2.2} textAnchor="middle">
            {name}
          </SvgText>
        </G>
      ))}

      {fleet.map((agv) => {
        const { x, y } = markerPoint(agv);
        const color = statusColor(agv.status);
        const dx = Math.cos(agv.pose.theta) * 3.6;
        const dy = -Math.sin(agv.pose.theta) * 3.6;
        const selected = agv.id === selectedId;
        return (
          <G key={agv.id}>
            {selected ? <Circle cx={x} cy={y} r={3.4} fill="none" stroke={colors.text} strokeWidth={0.35} /> : null}
            <Circle cx={x} cy={y} r={2.15} fill={color} />
            <Line x1={x} y1={y} x2={x + dx} y2={y + dy} stroke={color} strokeWidth={0.7} strokeLinecap="round" />
            <SvgText x={x} y={y + 5.2} fill={colors.text} fontSize={2.3} textAnchor="middle">
              {agv.id.replace('AGV-', '')}
            </SvgText>
          </G>
        );
      })}
    </Svg>
    <Pressable
      style={styles.hitLayer}
      onPress={selectAt}
      accessibilityRole="button"
      accessibilityLabel="Warehouse floor"
    />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
  },
  hitLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
});
