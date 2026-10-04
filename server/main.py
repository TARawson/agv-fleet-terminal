"""Offline-optional fleet server.

Mirrors MockFleetDataSource: four AGVs, a snapshot every 500ms, and a
periodic optical obstruction on AGV-03. Keep the waypoint table and tick
constants aligned with src/services/MockFleetDataSource.ts.

Run from this directory:

    pip install -r requirements.txt
    python main.py

Streams:
    ws://127.0.0.1:8000/ws/telemetry
    POST /api/dispatch        {"agvId": "AGV-01", "destination": "PICK-A", "payloadId": "PAL-1"}
    POST /api/estop
    POST /api/estop/release
    POST /api/alarms/ack      {"agvId": "AGV-03", "errorId": "optical-1"}
    Client ping on the socket: {"type": "ping", "sentAt": 1710000000000}
"""

from __future__ import annotations

import asyncio
import json
import math
import random
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

WAYPOINTS: dict[str, tuple[float, float]] = {
    "PICK-A": (12, 12),
    "PICK-B": (12, 48),
    "CHARGE-1": (88, 10),
    "CHARGE-2": (88, 50),
    "AISLE-1": (38, 16),
    "AISLE-2": (38, 44),
    "AISLE-3": (62, 16),
    "AISLE-4": (62, 44),
    "DOCK": (50, 6),
}

TICK_SECONDS = 0.5
DRAIN_PER_TICK = 0.25
CHARGE_PER_TICK = 1.5
LOW_BATTERY = 15
BATTERY_WARN = 40
BATTERY_WARN_CLEAR = 55
RESUME_BATTERY = 90
FAULT_VEHICLE_ID = "AGV-03"
FAULT_DURATION_SECONDS = 6
INITIAL_FAULT_DELAY_SECONDS = 8
FAULT_GAP_MIN_SECONDS = 10
FAULT_GAP_MAX_SECONDS = 18

@dataclass(frozen=True)
class RouteSeed:
    id: str
    cruise_speed: float
    battery: float
    route: tuple[str, ...]


FLEET_SEED = (
    RouteSeed("AGV-01", 8, 86, ("DOCK", "AISLE-1", "AISLE-2", "PICK-A")),
    RouteSeed("AGV-02", 10, 72, ("PICK-B", "AISLE-4", "CHARGE-2", "AISLE-3")),
    RouteSeed("AGV-03", 9, 64, ("AISLE-2", "PICK-B", "AISLE-4", "AISLE-1")),
    RouteSeed("AGV-04", 7, 36, ("CHARGE-1", "DOCK", "AISLE-3", "PICK-A")),
)


def is_charger(name: str | None) -> bool:
    return bool(name and name.startswith("CHARGE-"))


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def nearest_charger(x: float, y: float) -> str:
    def distance_sq(name: str) -> float:
        point = WAYPOINTS[name]
        return (point[0] - x) ** 2 + (point[1] - y) ** 2

    return min(("CHARGE-1", "CHARGE-2"), key=distance_sq)


@dataclass
class Vehicle:
    id: str
    x: float
    y: float
    theta: float
    battery_percent: float
    cruise_speed: float
    route: list[str]
    route_index: int
    destination: str | None
    speed: float = 0
    status: str = "NAVIGATING"
    payload_id: str | None = None
    target_override: str | None = None
    errors: list[dict[str, object]] = field(default_factory=list)
    hold_until: float = 0
    battery_warning_suppressed: bool = False


def battery_warning(agv_id: str) -> dict[str, object]:
    return {
        "id": f"battery-{agv_id}",
        "code": "LOW_BATTERY",
        "message": "Battery is below the warning threshold",
        "severity": "WARNING",
        "timestamp": int(time.time() * 1000),
        "acknowledged": False,
    }


def create_vehicle(seed: RouteSeed) -> Vehicle:
    route = list(seed.route)
    origin = WAYPOINTS[route[0]]
    nxt = WAYPOINTS[route[1]]
    vehicle = Vehicle(
        id=seed.id,
        x=origin[0],
        y=origin[1],
        theta=math.atan2(nxt[1] - origin[1], nxt[0] - origin[0]),
        battery_percent=seed.battery,
        cruise_speed=seed.cruise_speed,
        route=route,
        route_index=1,
        destination=route[1],
    )
    if vehicle.battery_percent <= BATTERY_WARN:
        vehicle.errors.append(battery_warning(seed.id))
    return vehicle


class FleetSimulation:
    """Same motion rules as MockFleetDataSource, clocked in seconds."""

    def __init__(self) -> None:
        self.vehicles = [create_vehicle(seed) for seed in FLEET_SEED]
        self.fleet_estop = False
        self.next_fault_at = time.monotonic() + INITIAL_FAULT_DELAY_SECONDS

    def dispatch_task(self, agv_id: str, destination: str, payload_id: str | None = None) -> bool:
        if self.fleet_estop or destination not in WAYPOINTS:
            return False
        agv = next((vehicle for vehicle in self.vehicles if vehicle.id == agv_id), None)
        if agv is None or agv.status in ("FAULT", "ESTOP"):
            return False
        agv.target_override = destination
        agv.destination = destination
        agv.status = "NAVIGATING"
        if payload_id:
            agv.payload_id = payload_id
        return True

    def trigger_emergency_stop(self) -> None:
        self.fleet_estop = True
        for agv in self.vehicles:
            agv.status = "ESTOP"
            agv.speed = 0

    def release_emergency_stop(self) -> None:
        self.fleet_estop = False
        now = time.monotonic()
        for agv in self.vehicles:
            if agv.status != "ESTOP":
                continue
            agv.status = "FAULT" if agv.hold_until > now else "NAVIGATING"

    def acknowledge_error(self, agv_id: str, error_id: str) -> bool:
        agv = next((vehicle for vehicle in self.vehicles if vehicle.id == agv_id), None)
        if agv is None:
            return False
        error = next((entry for entry in agv.errors if entry.get("id") == error_id), None)
        if error is None:
            return False
        agv.errors = [entry for entry in agv.errors if entry.get("id") != error_id]
        if error.get("code") == "OPTICAL_OBSTRUCTION":
            agv.hold_until = 0
            if not self.fleet_estop and agv.status == "FAULT":
                agv.status = "NAVIGATING"
        if error.get("code") == "LOW_BATTERY":
            agv.battery_warning_suppressed = True
        return True

    def tick(self) -> None:
        now = time.monotonic()
        for agv in self.vehicles:
            self._step_vehicle(agv, now)
            self._update_battery_warning(agv)
        self._maybe_inject_fault(now)

    def _update_battery_warning(self, agv: Vehicle) -> None:
        if agv.battery_percent >= BATTERY_WARN_CLEAR:
            agv.battery_warning_suppressed = False
            agv.errors = [error for error in agv.errors if error.get("code") != "LOW_BATTERY"]
            return
        if (
            agv.battery_percent <= BATTERY_WARN
            and not agv.battery_warning_suppressed
            and not any(error.get("code") == "LOW_BATTERY" for error in agv.errors)
        ):
            agv.errors.append(battery_warning(agv.id))

    def snapshot(self) -> list[dict[str, object]]:
        return [
            {
                "id": agv.id,
                "pose": {
                    "x": round(agv.x, 2),
                    "y": round(agv.y, 2),
                    "theta": round(agv.theta, 3),
                },
                "status": agv.status,
                "batteryPercent": round(agv.battery_percent, 1),
                "speed": round(agv.speed, 2),
                "payloadId": agv.payload_id,
                "destination": agv.destination,
                "errors": [dict(error) for error in agv.errors],
            }
            for agv in self.vehicles
        ]

    def _step_vehicle(self, agv: Vehicle, now: float) -> None:
        if self.fleet_estop:
            agv.status = "ESTOP"
            agv.speed = 0
            return

        if agv.hold_until > 0 and now >= agv.hold_until:
            agv.hold_until = 0
            agv.errors = [error for error in agv.errors if error.get("code") != "OPTICAL_OBSTRUCTION"]
            if agv.status == "FAULT":
                agv.status = "NAVIGATING"

        if agv.hold_until > now:
            agv.status = "FAULT"
            agv.speed = 0
            return

        if agv.status == "IDLE":
            agv.speed = 0
            agv.status = "NAVIGATING"
            return

        if agv.status == "CHARGING":
            agv.speed = 0
            agv.battery_percent = clamp(agv.battery_percent + CHARGE_PER_TICK, 0, 100)
            if agv.battery_percent < RESUME_BATTERY:
                return
            agv.status = "NAVIGATING"

        if agv.battery_percent <= LOW_BATTERY and not is_charger(agv.destination):
            agv.target_override = nearest_charger(agv.x, agv.y)

        self._step_toward_target(agv)

    def _step_toward_target(self, agv: Vehicle) -> None:
        name = agv.target_override or agv.route[agv.route_index]
        target = WAYPOINTS[name]
        agv.destination = name
        dx = target[0] - agv.x
        dy = target[1] - agv.y
        distance = math.hypot(dx, dy)
        if distance < 0.05 or agv.cruise_speed * TICK_SECONDS >= distance:
            self._arrive(agv, name)
            return

        agv.theta = math.atan2(dy, dx)
        step = agv.cruise_speed * TICK_SECONDS
        agv.x += (dx / distance) * step
        agv.y += (dy / distance) * step
        agv.speed = agv.cruise_speed
        agv.status = "NAVIGATING"
        agv.battery_percent = clamp(agv.battery_percent - DRAIN_PER_TICK, 0, 100)

    def _arrive(self, agv: Vehicle, name: str) -> None:
        target = WAYPOINTS[name]
        was_override = agv.target_override == name
        agv.x = target[0]
        agv.y = target[1]
        agv.speed = 0
        agv.destination = name
        if was_override:
            agv.target_override = None
        if agv.route[agv.route_index] == name:
            agv.route_index = (agv.route_index + 1) % len(agv.route)
        if is_charger(name) and agv.battery_percent < RESUME_BATTERY:
            agv.status = "CHARGING"
            return
        agv.status = "IDLE" if was_override else "NAVIGATING"

    def _maybe_inject_fault(self, now: float) -> None:
        if self.fleet_estop or now < self.next_fault_at:
            return
        agv = next((vehicle for vehicle in self.vehicles if vehicle.id == FAULT_VEHICLE_ID), None)
        if agv is None or agv.hold_until > now:
            return

        agv.hold_until = now + FAULT_DURATION_SECONDS
        agv.status = "FAULT"
        agv.speed = 0
        timestamp = int(time.time() * 1000)
        agv.errors = [error for error in agv.errors if error.get("code") != "OPTICAL_OBSTRUCTION"]
        agv.errors.append(
            {
                "id": f"optical-{timestamp}",
                "code": "OPTICAL_OBSTRUCTION",
                "message": "Optical obstruction detected on the forward scanner",
                "severity": "CRITICAL",
                "timestamp": timestamp,
                "acknowledged": False,
            }
        )
        gap = random.uniform(FAULT_GAP_MIN_SECONDS, FAULT_GAP_MAX_SECONDS)
        self.next_fault_at = agv.hold_until + gap


SIM = FleetSimulation()
CLIENTS: set[WebSocket] = set()
SEND_LOCK = asyncio.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    task = asyncio.create_task(broadcast_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="AGV Fleet Terminal", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class DispatchRequest(BaseModel):
    agvId: str
    destination: str
    payloadId: str | None = None


class AckRequest(BaseModel):
    agvId: str
    errorId: str


async def safe_send(websocket: WebSocket, payload: object) -> None:
    async with SEND_LOCK:
        await websocket.send_json(payload)


async def broadcast_snapshot() -> None:
    payload = SIM.snapshot()
    dead: list[WebSocket] = []
    for websocket in list(CLIENTS):
        try:
            await safe_send(websocket, payload)
        except Exception:
            dead.append(websocket)
    for websocket in dead:
        CLIENTS.discard(websocket)


async def broadcast_loop() -> None:
    while True:
        SIM.tick()
        await broadcast_snapshot()
        await asyncio.sleep(TICK_SECONDS)


@app.websocket("/ws/telemetry")
async def telemetry(websocket: WebSocket) -> None:
    await websocket.accept()
    CLIENTS.add(websocket)
    try:
        await safe_send(websocket, SIM.snapshot())
        while True:
            raw = await websocket.receive_text()
            await handle_client_message(websocket, raw)
    except WebSocketDisconnect:
        pass
    finally:
        CLIENTS.discard(websocket)


async def handle_client_message(websocket: WebSocket, raw: str) -> None:
    try:
        message = json.loads(raw)
    except json.JSONDecodeError:
        return
    if isinstance(message, dict) and message.get("type") == "ping":
        await safe_send(websocket, {"type": "pong", "sentAt": message.get("sentAt")})


@app.post("/api/dispatch")
async def dispatch(body: DispatchRequest) -> dict[str, bool]:
    if not SIM.dispatch_task(body.agvId, body.destination, body.payloadId):
        raise HTTPException(status_code=400, detail="Dispatch rejected")
    await broadcast_snapshot()
    return {"ok": True}


@app.post("/api/estop")
async def estop() -> dict[str, bool]:
    SIM.trigger_emergency_stop()
    await broadcast_snapshot()
    return {"ok": True}


@app.post("/api/estop/release")
async def release_estop() -> dict[str, bool]:
    SIM.release_emergency_stop()
    await broadcast_snapshot()
    return {"ok": True}


@app.post("/api/alarms/ack")
async def acknowledge(body: AckRequest) -> dict[str, bool]:
    if not SIM.acknowledge_error(body.agvId, body.errorId):
        raise HTTPException(status_code=404, detail="Alarm not found")
    await broadcast_snapshot()
    return {"ok": True}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
