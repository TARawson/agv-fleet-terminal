# AGV Fleet Terminal

Industrial warehouse terminal for an autonomous mobile robot fleet. The app shows live vehicle telemetry, a 2D floor plan, a scan-and-dispatch task flow, and an alarm log. It runs offline against an in-memory simulation, and the same screens can talk to the optional FastAPI server.

## Run the terminal

```bash
npm install
npm run web
```

`npm start` opens the Expo dev tools. `npm run android` and `npm run ios` target a device or emulator. The default data source is `MockFleetDataSource`, so the four vehicles move as soon as the app loads. No Python process is required.

On the web build, camera scanning needs a browser that can grant camera access. The Pick tab also accepts a typed bin or pallet code.

## Optional live server

The Python server publishes the same telemetry shape and accepts the same commands.

```bash
cd server
pip install -r requirements.txt
python main.py
```

It listens on `http://127.0.0.1:8000`.

| Endpoint | Body |
| --- | --- |
| `ws://127.0.0.1:8000/ws/telemetry` | JSON array of `AGVTelemetry` |
| `POST /api/dispatch` | `{ "agvId", "destination", "payloadId"? }` |
| `POST /api/estop` | empty |
| `POST /api/estop/release` | empty |
| `POST /api/alarms/ack` | `{ "agvId", "errorId" }` |

The UI boots on the mock. To point it at the server, create the live source once and pass it into `FleetProvider` in `App.tsx`:

```tsx
const [source] = useState(() => new LiveWebSocketDataSource());

<FleetProvider source={source}>
```

Screens do not change. They only see `FleetDataSource`.

## Screens

- **Fleet Dashboard.** Latency, active zone, emergency stop and release, fleet counts, and a short event ticker.
- **Fleet Monitor.** Warehouse floor in SVG. Tap a marker for speed, battery, destination, and faults.
- **Task Terminal.** Scan or type a bin, scan or type a pallet, choose an AGV and a waypoint, then dispatch.
- **Diagnostics.** Filter alarms by WARNING or CRITICAL and clear them. Clearing an optical obstruction lets that vehicle resume.

## Architecture

```text
Screens and canvas
        │
        ▼
FleetProvider  (React context)
        │
        ▼
FleetDataSource
        │
        ├── MockFleetDataSource      in-process simulation
        └── LiveWebSocketDataSource  FastAPI WebSocket + REST
```

**Decoupled data sources.** `src/services/FleetDataSource.ts` is the only contract the UI depends on: fleet subscription, connection state, dispatch, emergency stop, release, and alarm acknowledgement. The mock and the live client implement that interface independently. `FleetProvider` owns the active source, diffs snapshots into the event ticker (newest 12), and exposes commands. A screen never imports a transport.

**Concurrency.** The mock timer starts when the first fleet subscriber attaches and stops when the last one leaves, so a background screen does not keep simulating after unmount. The live client shares one socket between fleet and connection listeners, reconnects if the socket drops, and measures latency with a ping. The server holds an asyncio lock around socket sends so a telemetry broadcast and a ping reply cannot interleave on the same connection. Emergency stop latches the fleet until release. Acknowledging `OPTICAL_OBSTRUCTION` clears that hold. Acknowledging `LOW_BATTERY` suppresses the warning until the battery recovers.

**Component isolation.** Domain types live in `src/types/telemetry.ts`. Waypoint names and coordinates live in `src/types/waypoints.ts`, shared by the map, the pick flow, and the mock. Colors and the 48dp touch minimum live in `src/theme/colors.ts`. `WarehouseCanvas` only draws a fleet snapshot and reports a tapped vehicle id. Modals, badges, and metric cards do not subscribe to the network themselves.

Warehouse coordinates run from `x: 0–100` and `y: 0–60`, origin at the south-west corner. The canvas flips Y for SVG. Markers are drawn a small lane offset apart so vehicles that share an aisle stay readable. That offset is visual only. The simulation still moves each vehicle in a straight line between waypoints.

## Theme

Slate field (`#0E141B`), amber warnings, safety red faults, cyan paths, and green for vehicles that are navigating. Every pressable control uses at least a 48×48 dp target so the terminal stays usable with gloves on a tablet.
