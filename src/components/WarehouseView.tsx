import { WarehouseCanvas } from './WarehouseCanvas';
import type { AGVTelemetry } from '../types/telemetry';

interface WarehouseViewProps {
  fleet: AGVTelemetry[];
  width: number;
  height: number;
  selectedId: string | null;
  onSelect: (agvId: string) => void;
}

/** Native floor plan. The web build replaces this file with the Babylon scene. */
export function WarehouseView(props: WarehouseViewProps) {
  return <WarehouseCanvas {...props} />;
}
