import type { AGVStatus, AGVTelemetry, ErrorLog } from '../types/telemetry';
import { WAYPOINTS, isWaypointName, type WaypointName } from '../types/waypoints';
import type { ConnectionState, FleetDataSource } from './FleetDataSource';

const TICK_MS = 500;
const DRAIN_PER_TICK = 0.25;
const CHARGE_PER_TICK = 1.5;
const LOW_BATTERY = 15;
const BATTERY_WARN = 40;
const BATTERY_WARN_CLEAR = 55;
const RESUME_BATTERY = 90;
const LOCAL_LATENCY_MS = 8;
const FAULT_VEHICLE_ID = 'AGV-03';
const FAULT_DURATION_MS = 6000;
const INITIAL_FAULT_DELAY_MS = 8000;
const FAULT_GAP_MIN_MS = 10000;
const FAULT_GAP_MAX_MS = 18000;

interface VehicleState {
  id: string;
  x: number;
  y: number;
  theta: number;
  batteryPercent: number;
  cruiseSpeed: number;
  speed: number;
  status: AGVStatus;
  destination: string | null;
  payloadId: string | null;
  route: WaypointName[];
  routeIndex: number;
  targetOverride: WaypointName | null;
  errors: ErrorLog[];
  /** Epoch ms. The vehicle stays in FAULT until this time, then resumes. */
  holdUntil: number;
  /** Set when an operator clears a low-battery warning before the pack recovers. */
  batteryWarningSuppressed: boolean;
}

interface RouteSeed {
  id: string;
  cruiseSpeed: number;
  batteryPercent: number;
  route: WaypointName[];
}

const FLEET_SEED: RouteSeed[] = [
  { id: 'AGV-01', cruiseSpeed: 8, batteryPercent: 86, route: ['DOCK', 'AISLE-1', 'AISLE-2', 'PICK-A'] },
  { id: 'AGV-02', cruiseSpeed: 10, batteryPercent: 72, route: ['PICK-B', 'AISLE-4', 'CHARGE-2', 'AISLE-3'] },
  { id: 'AGV-03', cruiseSpeed: 9, batteryPercent: 64, route: ['AISLE-2', 'PICK-B', 'AISLE-4', 'AISLE-1'] },
  { id: 'AGV-04', cruiseSpeed: 7, batteryPercent: 36, route: ['CHARGE-1', 'DOCK', 'AISLE-3', 'PICK-A'] },
];

function batteryWarning(agvId: string, timestamp: number): ErrorLog {
  return {
    id: `battery-${agvId}`,
    code: 'LOW_BATTERY',
    message: 'Battery is below the warning threshold',
    severity: 'WARNING',
    timestamp,
    acknowledged: false,
  };
}

function isCharger(name: string | null): boolean {
  return name?.startsWith('CHARGE-') ?? false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2): number {
  const places = 10 ** digits;
  return Math.round(value * places) / places;
}

function nearestCharger(x: number, y: number): WaypointName {
  const chargers = ['CHARGE-1', 'CHARGE-2'] as const;
  return chargers.reduce((best, name) => {
    const bestPoint = WAYPOINTS[best];
    const point = WAYPOINTS[name];
    const bestDist = (bestPoint.x - x) ** 2 + (bestPoint.y - y) ** 2;
    const dist = (point.x - x) ** 2 + (point.y - y) ** 2;
    return dist < bestDist ? name : best;
  });
}

function createVehicle(seed: RouteSeed): VehicleState {
  const origin = WAYPOINTS[seed.route[0]];
  const next = WAYPOINTS[seed.route[1]];
  const vehicle: VehicleState = {
    id: seed.id,
    x: origin.x,
    y: origin.y,
    theta: Math.atan2(next.y - origin.y, next.x - origin.x),
    batteryPercent: seed.batteryPercent,
    cruiseSpeed: seed.cruiseSpeed,
    speed: 0,
    status: 'NAVIGATING',
    destination: seed.route[1],
    payloadId: null,
    route: seed.route,
    routeIndex: 1,
    targetOverride: null,
    errors: [],
    holdUntil: 0,
    batteryWarningSuppressed: false,
  };
  if (vehicle.batteryPercent <= BATTERY_WARN) {
    vehicle.errors = [batteryWarning(seed.id, Date.now())];
  }
  return vehicle;
}

/**
 * In-memory fleet. Four AGVs patrol fixed waypoints and publish a snapshot
 * every 500ms. AGV-03 periodically stops with an optical-obstruction fault.
 * The interval runs only while something is subscribed.
 */
export class MockFleetDataSource implements FleetDataSource {
  private readonly vehicles = FLEET_SEED.map(createVehicle);
  private readonly listeners = new Set<(agvs: AGVTelemetry[]) => void>();
  private readonly connectionListeners = new Set<(state: ConnectionState) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private fleetEstop = false;
  private nextFaultAt = Date.now() + INITIAL_FAULT_DELAY_MS;

  subscribeToFleet(callback: (agvs: AGVTelemetry[]) => void): () => void {
    this.listeners.add(callback);
    callback(this.snapshot());
    if (this.listeners.size === 1) {
      this.timer = setInterval(() => this.tick(), TICK_MS);
    }

    return () => {
      this.listeners.delete(callback);
      if (this.listeners.size === 0 && this.timer !== null) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  subscribeToConnection(callback: (state: ConnectionState) => void): () => void {
    this.connectionListeners.add(callback);
    callback({ status: 'connected', latencyMs: LOCAL_LATENCY_MS });
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  async dispatchTask(agvId: string, destination: string, payloadId?: string): Promise<boolean> {
    if (this.fleetEstop || !isWaypointName(destination)) {
      return false;
    }

    const agv = this.vehicles.find((vehicle) => vehicle.id === agvId);
    if (!agv || agv.status === 'FAULT' || agv.status === 'ESTOP') {
      return false;
    }

    agv.targetOverride = destination;
    agv.destination = destination;
    agv.status = 'NAVIGATING';
    if (payloadId) {
      agv.payloadId = payloadId;
    }
    this.emit();
    return true;
  }

  async triggerEmergencyStop(): Promise<void> {
    this.fleetEstop = true;
    for (const agv of this.vehicles) {
      agv.status = 'ESTOP';
      agv.speed = 0;
    }
    this.emit();
  }

  async releaseEmergencyStop(): Promise<void> {
    this.fleetEstop = false;
    const now = Date.now();
    for (const agv of this.vehicles) {
      if (agv.status !== 'ESTOP') {
        continue;
      }
      agv.status = agv.holdUntil > now ? 'FAULT' : 'NAVIGATING';
    }
    this.emit();
  }

  async acknowledgeError(agvId: string, errorId: string): Promise<boolean> {
    const agv = this.vehicles.find((vehicle) => vehicle.id === agvId);
    const error = agv?.errors.find((entry) => entry.id === errorId);
    if (!agv || !error) {
      return false;
    }

    agv.errors = agv.errors.filter((entry) => entry.id !== errorId);
    if (error.code === 'OPTICAL_OBSTRUCTION') {
      agv.holdUntil = 0;
      if (!this.fleetEstop && agv.status === 'FAULT') {
        agv.status = 'NAVIGATING';
      }
    }
    if (error.code === 'LOW_BATTERY') {
      agv.batteryWarningSuppressed = true;
    }
    this.emit();
    return true;
  }

  private tick(): void {
    const now = Date.now();
    for (const agv of this.vehicles) {
      this.stepVehicle(agv, now);
      this.updateBatteryWarning(agv, now);
    }
    this.maybeInjectFault(now);
    this.emit();
  }

  private updateBatteryWarning(agv: VehicleState, now: number): void {
    if (agv.batteryPercent >= BATTERY_WARN_CLEAR) {
      agv.batteryWarningSuppressed = false;
      agv.errors = agv.errors.filter((error) => error.code !== 'LOW_BATTERY');
      return;
    }
    if (
      agv.batteryPercent <= BATTERY_WARN &&
      !agv.batteryWarningSuppressed &&
      !agv.errors.some((error) => error.code === 'LOW_BATTERY')
    ) {
      agv.errors = [...agv.errors, batteryWarning(agv.id, now)];
    }
  }

  private stepVehicle(agv: VehicleState, now: number): void {
    if (this.fleetEstop) {
      agv.status = 'ESTOP';
      agv.speed = 0;
      return;
    }

    if (agv.holdUntil > 0 && now >= agv.holdUntil) {
      agv.holdUntil = 0;
      agv.errors = agv.errors.filter((error) => error.code !== 'OPTICAL_OBSTRUCTION');
      if (agv.status === 'FAULT') {
        agv.status = 'NAVIGATING';
      }
    }

    if (agv.holdUntil > now) {
      agv.status = 'FAULT';
      agv.speed = 0;
      return;
    }

    if (agv.status === 'IDLE') {
      agv.speed = 0;
      agv.status = 'NAVIGATING';
      return;
    }

    if (agv.status === 'CHARGING') {
      agv.speed = 0;
      agv.batteryPercent = clamp(agv.batteryPercent + CHARGE_PER_TICK, 0, 100);
      if (agv.batteryPercent < RESUME_BATTERY) {
        return;
      }
      agv.status = 'NAVIGATING';
    }

    if (agv.batteryPercent <= LOW_BATTERY && !isCharger(agv.destination)) {
      agv.targetOverride = nearestCharger(agv.x, agv.y);
    }

    this.stepTowardTarget(agv);
  }

  private stepTowardTarget(agv: VehicleState): void {
    const name = agv.targetOverride ?? agv.route[agv.routeIndex];
    const target = WAYPOINTS[name];
    agv.destination = name;

    const dx = target.x - agv.x;
    const dy = target.y - agv.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 0.05) {
      this.arrive(agv, name);
      return;
    }

    agv.theta = Math.atan2(dy, dx);
    const step = agv.cruiseSpeed * (TICK_MS / 1000);
    if (step >= distance) {
      this.arrive(agv, name);
      return;
    }

    agv.x += (dx / distance) * step;
    agv.y += (dy / distance) * step;
    agv.speed = agv.cruiseSpeed;
    agv.status = 'NAVIGATING';
    agv.batteryPercent = clamp(agv.batteryPercent - DRAIN_PER_TICK, 0, 100);
  }

  private arrive(agv: VehicleState, name: WaypointName): void {
    const target = WAYPOINTS[name];
    const wasOverride = agv.targetOverride === name;
    agv.x = target.x;
    agv.y = target.y;
    agv.speed = 0;
    agv.destination = name;

    if (wasOverride) {
      agv.targetOverride = null;
    }
    if (agv.route[agv.routeIndex] === name) {
      agv.routeIndex = (agv.routeIndex + 1) % agv.route.length;
    }

    if (isCharger(name) && agv.batteryPercent < RESUME_BATTERY) {
      agv.status = 'CHARGING';
      return;
    }

    agv.status = wasOverride ? 'IDLE' : 'NAVIGATING';
  }

  private maybeInjectFault(now: number): void {
    if (this.fleetEstop || now < this.nextFaultAt) {
      return;
    }

    const agv = this.vehicles.find((vehicle) => vehicle.id === FAULT_VEHICLE_ID);
    if (!agv || agv.holdUntil > now) {
      return;
    }

    agv.holdUntil = now + FAULT_DURATION_MS;
    agv.status = 'FAULT';
    agv.speed = 0;
    agv.errors = [
      ...agv.errors.filter((error) => error.code !== 'OPTICAL_OBSTRUCTION'),
      {
        id: `optical-${now}`,
        code: 'OPTICAL_OBSTRUCTION',
        message: 'Optical obstruction detected on the forward scanner',
        severity: 'CRITICAL',
        timestamp: now,
        acknowledged: false,
      },
    ];
    const gap = FAULT_GAP_MIN_MS + Math.random() * (FAULT_GAP_MAX_MS - FAULT_GAP_MIN_MS);
    this.nextFaultAt = agv.holdUntil + gap;
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private snapshot(): AGVTelemetry[] {
    return this.vehicles.map((agv) => ({
      id: agv.id,
      pose: {
        x: round(agv.x),
        y: round(agv.y),
        theta: round(agv.theta, 3),
      },
      status: agv.status,
      batteryPercent: round(agv.batteryPercent, 1),
      speed: round(agv.speed, 2),
      payloadId: agv.payloadId,
      destination: agv.destination,
      errors: agv.errors.map((error) => ({ ...error })),
    }));
  }
}
