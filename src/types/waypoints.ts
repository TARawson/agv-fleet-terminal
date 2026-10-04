/** Keep in sync with server/main.py. Plan units, origin at the south-west corner. */
export const WAYPOINTS = {
  'PICK-A': { x: 12, y: 12 },
  'PICK-B': { x: 12, y: 48 },
  'CHARGE-1': { x: 88, y: 10 },
  'CHARGE-2': { x: 88, y: 50 },
  'AISLE-1': { x: 38, y: 16 },
  'AISLE-2': { x: 38, y: 44 },
  'AISLE-3': { x: 62, y: 16 },
  'AISLE-4': { x: 62, y: 44 },
  DOCK: { x: 50, y: 6 },
} as const;

export type WaypointName = keyof typeof WAYPOINTS;

export function isWaypointName(name: string): name is WaypointName {
  return Object.prototype.hasOwnProperty.call(WAYPOINTS, name);
}
