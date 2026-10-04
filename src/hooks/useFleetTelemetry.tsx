import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MockFleetDataSource } from '../services/MockFleetDataSource';
import type { ConnectionState, FleetDataSource } from '../services/FleetDataSource';
import type { AGVTelemetry, AlarmSeverity } from '../types/telemetry';

export type FleetEventSeverity = 'INFO' | AlarmSeverity;

export interface FleetEvent {
  id: string;
  message: string;
  timestamp: number;
  severity: FleetEventSeverity;
}

interface FleetContextValue {
  fleet: AGVTelemetry[];
  connection: ConnectionState;
  events: FleetEvent[];
  dispatchTask: (agvId: string, destination: string, payloadId?: string) => Promise<boolean>;
  triggerEmergencyStop: () => Promise<void>;
  releaseEmergencyStop: () => Promise<void>;
  acknowledgeError: (agvId: string, errorId: string) => Promise<boolean>;
}

const FleetContext = createContext<FleetContextValue | null>(null);

function eventId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function statusMessage(agv: AGVTelemetry): string {
  switch (agv.status) {
    case 'ESTOP':
      return `${agv.id} emergency stop`;
    case 'FAULT':
      return `${agv.id} faulted`;
    case 'CHARGING':
      return `${agv.id} charging`;
    case 'IDLE':
      return `${agv.id} holding at ${agv.destination ?? 'waypoint'}`;
    case 'NAVIGATING':
      return `${agv.id} underway to ${agv.destination ?? 'waypoint'}`;
  }
}

function diffFleet(previous: AGVTelemetry[], next: AGVTelemetry[]): FleetEvent[] {
  const events: FleetEvent[] = [];
  const now = Date.now();
  for (const agv of next) {
    const before = previous.find((vehicle) => vehicle.id === agv.id);
    if (!before) {
      continue;
    }
    const newErrors = agv.errors.filter((error) => !before.errors.some((existing) => existing.id === error.id));
    for (const error of newErrors) {
      events.push({
        id: eventId(),
        message: `${agv.id} · ${error.message}`,
        timestamp: error.timestamp,
        severity: error.severity,
      });
    }
    if (before.status !== agv.status && newErrors.length === 0) {
      events.push({
        id: eventId(),
        message: statusMessage(agv),
        timestamp: now,
        severity: agv.status === 'FAULT' || agv.status === 'ESTOP' ? 'CRITICAL' : 'INFO',
      });
    }
    if (before.destination !== agv.destination && agv.destination && before.status === agv.status) {
      events.push({
        id: eventId(),
        message: `${agv.id} en route to ${agv.destination}`,
        timestamp: now,
        severity: 'INFO',
      });
    }
  }
  return events;
}

function initialEvents(fleet: AGVTelemetry[]): FleetEvent[] {
  const alarms = fleet.flatMap((agv) =>
    agv.errors.map((error) => ({
      id: eventId(),
      message: `${agv.id} · ${error.message}`,
      timestamp: error.timestamp,
      severity: error.severity,
    })),
  );
  return [
    ...alarms,
    {
      id: eventId(),
      message: `Fleet link established · ${fleet.length} units`,
      timestamp: Date.now(),
      severity: 'INFO' as const,
    },
  ];
}

export function FleetProvider({ children, source }: { children: ReactNode; source?: FleetDataSource }) {
  const [fleetSource] = useState(() => source ?? new MockFleetDataSource());
  const [fleet, setFleet] = useState<AGVTelemetry[]>([]);
  const [connection, setConnection] = useState<ConnectionState>({ status: 'connecting', latencyMs: null });
  const [events, setEvents] = useState<FleetEvent[]>([]);
  const previous = useRef<AGVTelemetry[] | null>(null);

  useEffect(() => {
    previous.current = null;
    const unsubscribeFleet = fleetSource.subscribeToFleet((next) => {
      const prior = previous.current;
      previous.current = next;
      setFleet(next);
      if (!prior) {
        setEvents(initialEvents(next));
        return;
      }
      const additions = diffFleet(prior, next);
      if (additions.length === 0) {
        return;
      }
      setEvents((current) => [...additions].reverse().concat(current).slice(0, 12));
    });
    const unsubscribeConnection = fleetSource.subscribeToConnection(setConnection);
    return () => {
      unsubscribeFleet();
      unsubscribeConnection();
    };
  }, [fleetSource]);

  const value = useMemo<FleetContextValue>(
    () => ({
      fleet,
      connection,
      events,
      dispatchTask: (agvId, destination, payloadId) => fleetSource.dispatchTask(agvId, destination, payloadId),
      triggerEmergencyStop: () => fleetSource.triggerEmergencyStop(),
      releaseEmergencyStop: () => fleetSource.releaseEmergencyStop(),
      acknowledgeError: (agvId, errorId) => fleetSource.acknowledgeError(agvId, errorId),
    }),
    [fleet, connection, events, fleetSource],
  );

  return <FleetContext.Provider value={value}>{children}</FleetContext.Provider>;
}

export function useFleet(): FleetContextValue {
  const value = useContext(FleetContext);
  if (!value) {
    throw new Error('useFleet must be used within FleetProvider');
  }
  return value;
}

export function useFleetTelemetry(): AGVTelemetry[] {
  return useFleet().fleet;
}
