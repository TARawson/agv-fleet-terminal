import type { AGVStatus, AGVTelemetry, AlarmSeverity, ErrorLog } from '../types/telemetry';
import type { ConnectionState, FleetDataSource } from './FleetDataSource';

/** Local FastAPI server started from `/server`. Pass an http(s) or ws(s) origin. */
export const DEFAULT_FLEET_SERVER_URL = 'http://127.0.0.1:8000';

const RECONNECT_MS = 2000;
const AGV_STATUSES: readonly AGVStatus[] = ['IDLE', 'NAVIGATING', 'CHARGING', 'FAULT', 'ESTOP'];
const ALARM_SEVERITIES: readonly AlarmSeverity[] = ['WARNING', 'CRITICAL'];

type Listener = (agvs: AGVTelemetry[]) => void;
type ConnectionListener = (state: ConnectionState) => void;

const PING_MS = 2000;

function withoutTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function toHttpBase(serverUrl: string): string {
  return withoutTrailingSlash(serverUrl).replace(/^ws/i, 'http');
}

function toWebSocketUrl(httpBase: string): string {
  return `${httpBase.replace(/^http/i, 'ws')}/ws/telemetry`;
}

function isStatus(value: unknown): value is AGVStatus {
  return typeof value === 'string' && (AGV_STATUSES as readonly string[]).includes(value);
}

function isSeverity(value: unknown): value is AlarmSeverity {
  return typeof value === 'string' && (ALARM_SEVERITIES as readonly string[]).includes(value);
}

function parseError(value: unknown): ErrorLog | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const error = value as Record<string, unknown>;
  if (
    typeof error.id !== 'string' ||
    typeof error.code !== 'string' ||
    typeof error.message !== 'string' ||
    !isSeverity(error.severity) ||
    typeof error.timestamp !== 'number' ||
    typeof error.acknowledged !== 'boolean'
  ) {
    return null;
  }
  return {
    id: error.id,
    code: error.code,
    message: error.message,
    severity: error.severity,
    timestamp: error.timestamp,
    acknowledged: error.acknowledged,
  };
}

function parseVehicle(value: unknown): AGVTelemetry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const vehicle = value as Record<string, unknown>;
  const pose = vehicle.pose;
  if (!pose || typeof pose !== 'object' || !Array.isArray(vehicle.errors)) {
    return null;
  }
  const point = pose as Record<string, unknown>;
  if (
    typeof vehicle.id !== 'string' ||
    typeof point.x !== 'number' ||
    typeof point.y !== 'number' ||
    typeof point.theta !== 'number' ||
    !isStatus(vehicle.status) ||
    typeof vehicle.batteryPercent !== 'number' ||
    typeof vehicle.speed !== 'number' ||
    !(vehicle.payloadId === null || typeof vehicle.payloadId === 'string') ||
    !(vehicle.destination === null || typeof vehicle.destination === 'string')
  ) {
    return null;
  }

  const errors: ErrorLog[] = [];
  for (const entry of vehicle.errors) {
    const error = parseError(entry);
    if (error) {
      errors.push(error);
    }
  }

  return {
    id: vehicle.id,
    pose: { x: point.x, y: point.y, theta: point.theta },
    status: vehicle.status,
    batteryPercent: vehicle.batteryPercent,
    speed: vehicle.speed,
    payloadId: vehicle.payloadId,
    destination: vehicle.destination,
    errors,
  };
}

/** Round-trip from a `{ "type": "pong", "sentAt" }` reply. Fleet arrays return null. */
export function parsePongLatency(data: unknown): number | null {
  if (typeof data !== 'string') {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const message = parsed as Record<string, unknown>;
    if (message.type !== 'pong' || typeof message.sentAt !== 'number') {
      return null;
    }
    return Math.max(0, Date.now() - message.sentAt);
  } catch {
    return null;
  }
}

/** Accepts the JSON array published on `/ws/telemetry`. Malformed payloads are ignored. */
export function parseFleetMessage(data: unknown): AGVTelemetry[] | null {
  const text = typeof data === 'string' ? data : null;
  if (text === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }

  const fleet: AGVTelemetry[] = [];
  for (const entry of parsed) {
    const vehicle = parseVehicle(entry);
    if (!vehicle) {
      return null;
    }
    fleet.push(vehicle);
  }
  return fleet;
}

/**
 * Live backend. Telemetry arrives on `/ws/telemetry`. Dispatch and e-stop are
 * POSTs to `/api/dispatch`, `/api/estop`, and `/api/estop/release`.
 * The socket stays open while at least one listener is subscribed and
 * reconnects if the server drops.
 */
export class LiveWebSocketDataSource implements FleetDataSource {
  private readonly serverUrl: string;
  private readonly telemetryUrl: string;
  private readonly listeners = new Set<Listener>();
  private readonly connectionListeners = new Set<ConnectionListener>();
  private lastFleet: AGVTelemetry[] = [];
  private connection: ConnectionState = { status: 'offline', latencyMs: null };
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closedByUser = false;

  constructor(serverUrl = DEFAULT_FLEET_SERVER_URL) {
    this.serverUrl = toHttpBase(serverUrl);
    this.telemetryUrl = toWebSocketUrl(this.serverUrl);
  }

  subscribeToFleet(callback: Listener): () => void {
    this.listeners.add(callback);
    if (this.lastFleet.length > 0) {
      callback(this.lastFleet);
    }
    this.connect();

    return () => {
      this.listeners.delete(callback);
      this.closeIfIdle();
    };
  }

  subscribeToConnection(callback: ConnectionListener): () => void {
    this.connectionListeners.add(callback);
    callback(this.connection);
    this.connect();

    return () => {
      this.connectionListeners.delete(callback);
      this.closeIfIdle();
    };
  }

  dispatchTask(agvId: string, destination: string, payloadId?: string): Promise<boolean> {
    return this.postJson('/api/dispatch', { agvId, destination, payloadId: payloadId ?? null });
  }

  async triggerEmergencyStop(): Promise<void> {
    await this.postJson('/api/estop', {});
  }

  async releaseEmergencyStop(): Promise<void> {
    await this.postJson('/api/estop/release', {});
  }

  acknowledgeError(agvId: string, errorId: string): Promise<boolean> {
    return this.postJson('/api/alarms/ack', { agvId, errorId });
  }

  private closeIfIdle(): void {
    if (this.listeners.size > 0 || this.connectionListeners.size > 0) {
      return;
    }
    this.closedByUser = true;
    this.stopPing();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
    this.setConnection({ status: 'offline', latencyMs: null });
  }

  private connect(): void {
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.closedByUser = false;
    this.setConnection({ status: 'connecting', latencyMs: null });

    const socket = new WebSocket(this.telemetryUrl);
    this.socket = socket;

    socket.onopen = () => {
      this.setConnection({ status: 'connected', latencyMs: null });
      this.startPing(socket);
    };

    socket.onmessage = (event) => {
      const latencyMs = parsePongLatency(event.data);
      if (latencyMs !== null) {
        this.setConnection({ status: 'connected', latencyMs });
        return;
      }
      const fleet = parseFleetMessage(event.data);
      if (!fleet) {
        return;
      }
      this.lastFleet = fleet;
      for (const listener of this.listeners) {
        listener(fleet);
      }
    };

    socket.onerror = () => {
      socket.close();
    };

    socket.onclose = () => {
      this.stopPing();
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.setConnection({ status: 'offline', latencyMs: null });
      if (this.closedByUser || (this.listeners.size === 0 && this.connectionListeners.size === 0)) {
        return;
      }
      this.scheduleReconnect();
    };
  }

  private startPing(socket: WebSocket): void {
    this.stopPing();
    const send = () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping', sentAt: Date.now() }));
      }
    };
    send();
    this.pingTimer = setInterval(send, PING_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private setConnection(state: ConnectionState): void {
    this.connection = state;
    for (const listener of this.connectionListeners) {
      listener(state);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_MS);
  }

  private async postJson(path: string, body: unknown): Promise<boolean> {
    try {
      const response = await fetch(`${this.serverUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        return false;
      }
      const payload: unknown = await response.json();
      return (
        typeof payload === 'object' &&
        payload !== null &&
        'ok' in payload &&
        payload.ok === true
      );
    } catch {
      return false;
    }
  }
}
