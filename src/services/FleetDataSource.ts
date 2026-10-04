import type { AGVTelemetry } from '../types/telemetry';

/** Link between the terminal and whichever fleet backend is active. */
export interface ConnectionState {
  status: 'connecting' | 'connected' | 'offline';
  /** Local simulation delay, or the live socket round-trip. Null until known. */
  latencyMs: number | null;
}

/**
 * Pluggable fleet backend. Screens depend on this contract, not on a
 * particular transport. `MockFleetDataSource` runs entirely on the device.
 * `LiveWebSocketDataSource` mirrors it against the FastAPI server.
 *
 * `destination` is a waypoint name (`PICK-A`, `AISLE-1`, `CHARGE-1`, …).
 * Unknown vehicles and unknown waypoints reject the dispatch.
 * Emergency stop latches the whole fleet until `releaseEmergencyStop`.
 * Acknowledging an optical obstruction clears the fault and lets that AGV resume.
 */
export interface FleetDataSource {
  /** Push a fleet snapshot whenever telemetry changes. Returns an unsubscribe. */
  subscribeToFleet(callback: (agvs: AGVTelemetry[]) => void): () => void;
  subscribeToConnection(callback: (state: ConnectionState) => void): () => void;
  dispatchTask(agvId: string, destination: string, payloadId?: string): Promise<boolean>;
  triggerEmergencyStop(): Promise<void>;
  releaseEmergencyStop(): Promise<void>;
  acknowledgeError(agvId: string, errorId: string): Promise<boolean>;
}
