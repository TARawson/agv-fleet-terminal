# agv-fleet-terminal Implementation Plan

This project demonstrates production-ready React Native fundamentals tailored specifically to industrial warehouse execution systems (WES) and autonomous mobile robot (AMR/AGV) fleet management. It features an offline-first simulated telemetry mode for instant client-side testing, alongside an optional Python WebSocket backend to demonstrate full-stack systems capability.

## 1. System Architecture & Tech Stack

```text
┌─────────────────────────────────────────────────────────────────┐
│                    React Native Client (Expo)                   │
│                                                                 │
│  ┌───────────────────────┐             ┌─────────────────────┐  │
│  │   Presentation Layer  │             │  State / ViewModel  │  │
│  │  • Fleet Map (SVG)    │ ◄─────────► │  • Telemetry Store  │  │
│  │  • Barcode Scanner    │             │  • Active Task Queue│  │
│  │  • Alarm Feed & Audit │             │  • Connection State │  │
│  └───────────────────────┘             └──────────┬──────────┘  │
│                                                   │             │
│                                        ┌──────────▼──────────┐  │
│                                        │ FleetDataSource (IF)│  │
│                                        └──────────┬──────────┘  │
└───────────────────────────────────────────────────┼─────────────┘
                                                    │
                   ┌────────────────────────────────┴────────────────┐
                   ▼                                                 ▼
     ┌───────────────────────────┐                     ┌───────────────────────────┐
     │   MockFleetDataSource     │                     │  LiveWebSocketDataSource  │
     │  (In-Memory Simulation)   │                     │  (FastAPI Python Server)  │
     │  • Path waypoints         │                     │  • /ws/telemetry          │
     │  • Random fault injection │                     │  • /api/dispatch          │
     └───────────────────────────┘                     └───────────────────────────┘
```

**Frontend:** React Native (Expo SDK), TypeScript, React Navigation (Bottom Tabs), `react-native-svg` (for 2D floorplan visualization), `expo-camera` (for barcode scanning simulation).

**State & Networking:** React Context / custom hooks with an abstracted `FleetDataSource` interface (supporting instant offline simulation or live WebSockets).

**Backend (`/server`):** Python (FastAPI, Uvicorn, WebSockets) simulating AMR coordinates, battery degradation, and dispatch task orchestration.

## 2. Implementation Roadmap

### Phase 1: Project Setup & Core Types (Hours 1–3)

Initialize an Expo TypeScript project:

```bash
npx create-expo-app@latest agv-fleet-terminal --template blank-typescript
npx expo install @react-navigation/native @react-navigation/bottom-tabs react-native-screens react-native-safe-area-context react-native-svg expo-camera
```

Define the core domain models in `src/types/telemetry.ts`:

- `AGVStatus`: `'IDLE' | 'NAVIGATING' | 'CHARGING' | 'FAULT' | 'ESTOP'`
- `AGVTelemetry`: Vehicle ID, coordinates `(x, y, θ)`, battery percentage, payload ID, speed, error logs.
- `WarehouseTask`: Task ID, target waypoint, priority level, creation timestamp.

### Phase 2: Telemetry Engine & Data Abstraction (Hours 3–6)

Define the `FleetDataSource` contract:

- `subscribeToFleet(callback: (agvs: AGVTelemetry[]) => void): () => void`
- `dispatchTask(agvId: string, destination: string): Promise<boolean>`
- `triggerEmergencyStop(): Promise<void>`

Implement `MockFleetDataSource.ts`:

- Pre-program 4 AGVs moving between predefined Cartesian waypoints on a coordinate plane (`x: 0–100`, `y: 0–60`).
- Emit coordinate updates every 500ms using `setInterval`.
- Periodically trigger a simulated optical obstruction on AGV-03 to showcase alarm handling.

Build the `/server` directory with `main.py` using FastAPI to provide an identical WebSocket stream for reviewers running the local server.

### Phase 3: Screen Development (Hours 6–12)

**Screen 1: Dashboard** (`screens/DashboardScreen.tsx`)

- Top bar: network latency pill, active zone indicator, system E-Stop button.
- Fleet health metric cards: active units, charging count, faulted count.
- Recent event ticker displaying operational milestones.

**Screen 2: 2D Fleet Monitor** (`screens/FleetMapScreen.tsx`)

- Use `react-native-svg` to draw a simplified warehouse floor: static rack aisles, charging pads, pick stations.
- Render dynamic SVG markers with directional heading arrows for each AGV.
- Bottom sheet / detail modal: tap an AGV to view live diagnostics (speed, battery, route destination).

**Screen 3: Task & Scan Terminal** (`screens/PickingScreen.tsx`)

- Embedded camera viewfinder targeting 1D/2D barcodes using `expo-camera`.
- Step-by-step task flow: Scan Bin → Scan Pallet ID → Select Target AGV → Dispatch.
- Manual override input for testing on devices without physical barcode assets.

**Screen 4: Diagnostics & Alarms** (`screens/AlarmLogScreen.tsx`)

- Filterable event stream (ALL, WARNING, CRITICAL).
- Acknowledge/Clear error button with real-time state resolution.

### Phase 4: Polish, Profiling & Documentation (Hours 12–16)

- **Industrial Dark Theme:** Implement a high-contrast industrial color palette (slate dark background, high-visibility amber for warnings, safety red for faults, vivid cyan/green for operational paths).
- **Touch Target Sizing:** Ensure all touchable elements meet industrial specs (≥ 48×48 dp minimum) for tablet/glove usage.
- **README & Demo Media:**
  - Record a short demo video/GIF of moving robots on the 2D grid and the barcode scanner in action.
  - Write an architectural breakdown highlighting concurrency, decoupled data sources, and component isolation.

## 3. Directory Layout

```text
agv-fleet-terminal/
├── assets/                  # Icons, warehouse floor SVG templates
├── server/                  # Optional Python demonstration server
│   ├── main.py              # FastAPI app with WebSocket broadcasting
│   └── requirements.txt     # fastapi, uvicorn, websockets
├── src/
│   ├── components/          # Reusable UI primitives
│   │   ├── AgvDetailModal.tsx
│   │   ├── MetricCard.tsx
│   │   ├── StatusBadge.tsx
│   │   └── WarehouseCanvas.tsx
│   ├── hooks/               # Custom hooks for telemetry data
│   │   └── useFleetTelemetry.ts
│   ├── navigation/          # BottomTabNavigator & Navigation stacks
│   │   └── RootNavigator.tsx
│   ├── screens/             # Primary terminal views
│   │   ├── AlarmLogScreen.tsx
│   │   ├── DashboardScreen.tsx
│   │   ├── FleetMapScreen.tsx
│   │   └── PickingScreen.tsx
│   ├── services/            # Pluggable telemetry services
│   │   ├── FleetDataSource.ts
│   │   ├── LiveWebSocketDataSource.ts
│   │   └── MockFleetDataSource.ts
│   ├── types/               # TypeScript interfaces
│   │   └── telemetry.ts
│   └── theme/               # Color tokens & typography
│       └── colors.ts
├── App.tsx                  # Root entry point
├── app.json                 # Expo configuration
├── package.json
└── README.md
```
