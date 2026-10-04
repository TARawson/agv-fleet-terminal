import type { AGVStatus } from '../types/telemetry';

/** Industrial dark palette: slate field, amber warnings, safety red, cyan/green paths. */
export const colors = {
  background: '#0E141B',
  surface: '#17212B',
  surfaceRaised: '#1E2C38',
  border: '#2E4050',
  text: '#E7EEF5',
  textMuted: '#8EA0B3',
  accent: '#2EE6A6',
  path: '#3DDCFF',
  warning: '#FFB020',
  fault: '#FF3B30',
  overlay: 'rgba(6, 10, 14, 0.72)',
  ink: '#14110A',
  /** Rack and dock fills on the floor plan. */
  rack: '#243444',
  /** Selected pick stations and confirmation chips. */
  pickFill: '#14352C',
  /** Chargers and selected diagnostic filters. */
  chargeFill: '#12343C',
} as const;

/** Glove and tablet minimum from the terminal spec. */
export const minTouchTarget = 48;

export function statusColor(status: AGVStatus): string {
  switch (status) {
    case 'NAVIGATING':
      return colors.accent;
    case 'CHARGING':
      return colors.path;
    case 'IDLE':
      return colors.textMuted;
    case 'FAULT':
    case 'ESTOP':
      return colors.fault;
  }
}
