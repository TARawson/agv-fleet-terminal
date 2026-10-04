/** Warehouse floor in plan units. Origin is the south-west corner. */
export const WAREHOUSE_BOUNDS = {
  minX: 0,
  maxX: 100,
  minY: 0,
  maxY: 60,
} as const;

/** Live motion state reported by an AGV. */
export type AGVStatus = 'IDLE' | 'NAVIGATING' | 'CHARGING' | 'FAULT' | 'ESTOP';

/** Alarm severity used by the diagnostics feed. */
export type AlarmSeverity = 'WARNING' | 'CRITICAL';

/** Dispatch priority for a warehouse task. */
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Pose on the warehouse plane.
 * `x` and `y` are plan units. `theta` is heading in radians,
 * with 0 along +x and increasing counterclockwise.
 */
export interface Pose {
  x: number;
  y: number;
  theta: number;
}

/** A single fault or warning attached to a vehicle. */
export interface ErrorLog {
  id: string;
  code: string;
  message: string;
  severity: AlarmSeverity;
  /** Epoch milliseconds. */
  timestamp: number;
  acknowledged: boolean;
}

/** Point-in-time telemetry for one AGV. */
export interface AGVTelemetry {
  id: string;
  pose: Pose;
  status: AGVStatus;
  /** 0–100. */
  batteryPercent: number;
  /** Warehouse units per second. */
  speed: number;
  /** Pallet or load identifier while carrying; null when empty. */
  payloadId: string | null;
  /** Current route target; null when the vehicle has no assignment. */
  destination: string | null;
  errors: ErrorLog[];
}

/** A dispatchable move from the task terminal. */
export interface WarehouseTask {
  id: string;
  targetWaypoint: string;
  priority: TaskPriority;
  /** Epoch milliseconds. */
  createdAt: number;
}
