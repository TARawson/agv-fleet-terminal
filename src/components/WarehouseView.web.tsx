import { createElement, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Engine } from '@babylonjs/core/Engines/engine';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Mesh as MeshClass } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import type { AGVTelemetry } from '../types/telemetry';
import { WAYPOINTS, type WaypointName } from '../types/waypoints';
import { colors, statusColor } from '../theme/colors';
import '@babylonjs/core/Culling/ray';

interface WarehouseViewProps {
  fleet: AGVTelemetry[];
  width: number;
  height: number;
  selectedId: string | null;
  onSelect: (agvId: string) => void;
}

const LANE_OFFSET: Record<string, number> = {
  'AGV-01': -3.2,
  'AGV-02': -1.1,
  'AGV-03': 1.1,
  'AGV-04': 3.2,
};

interface VehicleNodes {
  root: TransformNode;
  body: Mesh;
  nose: Mesh;
  ring: Mesh;
}

function colorOf(hex: string): Color3 {
  return Color3.FromHexString(hex);
}

function material(scene: Scene, name: string, hex: string, cache: Map<string, StandardMaterial>): StandardMaterial {
  const existing = cache.get(hex);
  if (existing) {
    return existing;
  }
  const created = new StandardMaterial(name, scene);
  const color = colorOf(hex);
  created.diffuseColor = color;
  created.emissiveColor = color.scale(0.35);
  created.specularColor = Color3.Black();
  cache.set(hex, created);
  return created;
}

function station(
  scene: Scene,
  name: string,
  x: number,
  z: number,
  width: number,
  depth: number,
  fill: string,
  mats: Map<string, StandardMaterial>,
) {
  const box = CreateBox(name, { width, height: 0.6, depth }, scene);
  box.position.set(x, 0.3, z);
  box.material = material(scene, `${name}-mat`, fill, mats);
  box.isPickable = false;
}

function addLabel(scene: Scene, text: string, tint: string, parent?: TransformNode) {
  const plane = CreatePlane(`${text}-label`, { width: 8, height: 2.2 }, scene);
  plane.position.y = parent ? 2.6 : 2.4;
  plane.billboardMode = MeshClass.BILLBOARDMODE_ALL;
  plane.isPickable = false;
  if (parent) {
    plane.parent = parent;
  }
  const texture = new DynamicTexture(`${text}-tex`, { width: 256, height: 72 }, scene, false);
  texture.hasAlpha = true;
  const ctx = texture.getContext() as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, 256, 72);
  ctx.font = 'bold 40px sans-serif';
  ctx.fillStyle = tint;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 36);
  texture.update();
  const mat = new StandardMaterial(`${text}-label-mat`, scene);
  mat.diffuseTexture = texture;
  mat.opacityTexture = texture;
  mat.emissiveColor = Color3.White();
  mat.backFaceCulling = false;
  mat.disableLighting = true;
  plane.material = mat;
  return plane;
}

export function WarehouseView({ fleet, width, height, selectedId, onSelect }: WarehouseViewProps) {
  const { t } = useTranslation();
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const syncRef = useRef<(() => void) | null>(null);
  const fleetRef = useRef(fleet);
  const selectedRef = useRef(selectedId);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    if (!canvas) {
      return;
    }
    const engine = new Engine(canvas, true, { adaptToDeviceRatio: true });
    const scene = new Scene(engine);
    scene.clearColor = Color4.FromHexString(`${colors.background}ff`);

    const camera = new ArcRotateCamera('overview', -Math.PI / 2, 0.85, 105, new Vector3(50, 0, 30), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 45;
    camera.upperRadiusLimit = 170;
    camera.lowerBetaLimit = 0.25;
    camera.upperBetaLimit = 1.25;
    camera.wheelPrecision = 30;
    camera.panningSensibility = 40;

    const sun = new HemisphericLight('sun', new Vector3(0.2, 1, 0.3), scene);
    sun.intensity = 0.95;

    const mats = new Map<string, StandardMaterial>();
    const floor = CreateGround('floor', { width: 100, height: 60 }, scene);
    floor.position.set(50, 0, 30);
    floor.material = material(scene, 'floor-mat', colors.surface, mats);
    floor.isPickable = false;

    for (const x of [20, 40, 60, 80]) {
      const line = CreateLines(`vx-${x}`, { points: [new Vector3(x, 0.05, 0), new Vector3(x, 0.05, 60)] }, scene);
      line.color = colorOf(colors.border);
      line.isPickable = false;
    }
    for (const z of [20, 40]) {
      const line = CreateLines(`hz-${z}`, { points: [new Vector3(0, 0.05, z), new Vector3(100, 0.05, z)] }, scene);
      line.color = colorOf(colors.border);
      line.isPickable = false;
    }

    station(scene, 'dock', 50, 6, 16, 7, colors.rack, mats);
    const dockLabel = addLabel(scene, 'DOCK', colors.textMuted);
    dockLabel.position.set(50, 2.4, 6);
    const aisles: WaypointName[] = ['AISLE-1', 'AISLE-2', 'AISLE-3', 'AISLE-4'];
    const picks: WaypointName[] = ['PICK-A', 'PICK-B'];
    const chargers: WaypointName[] = ['CHARGE-1', 'CHARGE-2'];
    for (const name of aisles) {
      station(scene, name, WAYPOINTS[name].x, WAYPOINTS[name].y, 8, 8, colors.rack, mats);
    }
    for (const name of picks) {
      station(scene, name, WAYPOINTS[name].x, WAYPOINTS[name].y, 12, 8, colors.pickFill, mats);
      addLabel(scene, name, colors.accent).position.set(WAYPOINTS[name].x, 2.4, WAYPOINTS[name].y);
    }
    for (const name of chargers) {
      station(scene, name, WAYPOINTS[name].x, WAYPOINTS[name].y, 10, 7, colors.chargeFill, mats);
      addLabel(scene, name, colors.path).position.set(WAYPOINTS[name].x, 2.4, WAYPOINTS[name].y);
    }

    const vehicles = new Map<string, VehicleNodes>();

    function sync() {
      const seen = new Set<string>();
      for (const agv of fleetRef.current) {
        seen.add(agv.id);
        let nodes = vehicles.get(agv.id);
        if (!nodes) {
          const root = new TransformNode(agv.id, scene);
          const body = CreateBox(`${agv.id}-body`, { width: 3.4, height: 0.9, depth: 2.2 }, scene);
          body.parent = root;
          body.position.y = 0.75;
          body.metadata = { agvId: agv.id };
          const nose = CreateBox(`${agv.id}-nose`, { width: 1.5, height: 0.35, depth: 0.45 }, scene);
          nose.parent = root;
          nose.position.set(2.2, 0.75, 0);
          nose.metadata = { agvId: agv.id };
          const ring = CreateTorus(`${agv.id}-ring`, { diameter: 5.2, thickness: 0.12, tessellation: 28 }, scene);
          ring.parent = root;
          ring.position.y = 0.12;
          ring.isPickable = false;
          const ringMat = new StandardMaterial(`${agv.id}-ring-mat`, scene);
          ringMat.diffuseColor = colorOf(colors.text);
          ringMat.emissiveColor = colorOf(colors.text);
          ring.material = ringMat;
          addLabel(scene, agv.id.replace('AGV-', ''), colors.text, root);
          nodes = { root, body, nose, ring };
          vehicles.set(agv.id, nodes);
        }
        const lane = LANE_OFFSET[agv.id] ?? 0;
        const offsetX = -Math.sin(agv.pose.theta) * lane;
        const offsetZ = Math.cos(agv.pose.theta) * lane;
        nodes.root.position.set(agv.pose.x + offsetX, 0, agv.pose.y + offsetZ);
        nodes.root.rotation.y = -agv.pose.theta;
        const paint = material(scene, agv.status, statusColor(agv.status), mats);
        nodes.body.material = paint;
        nodes.nose.material = paint;
        nodes.ring.setEnabled(agv.id === selectedRef.current);
      }
      for (const [id, nodes] of vehicles) {
        if (seen.has(id)) {
          continue;
        }
        nodes.root.dispose(false, true);
        vehicles.delete(id);
      }
    }

    const pointer = scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERPICK) {
        return;
      }
      const agvId = info.pickInfo?.pickedMesh?.metadata?.agvId;
      if (typeof agvId === 'string') {
        onSelectRef.current(agvId);
      }
    });

    engineRef.current = engine;
    syncRef.current = sync;
    engine.runRenderLoop(() => {
      scene.render();
    });
    sync();

    return () => {
      syncRef.current = null;
      engineRef.current = null;
      scene.onPointerObservable.remove(pointer);
      scene.dispose();
      engine.dispose();
    };
  }, [canvas]);

  useEffect(() => {
    engineRef.current?.resize();
  }, [width, height]);

  useEffect(() => {
    fleetRef.current = fleet;
    selectedRef.current = selectedId;
    onSelectRef.current = onSelect;
    syncRef.current?.();
  }, [fleet, selectedId, onSelect]);

  return createElement('canvas', {
    ref: setCanvas,
    width,
    height,
    style: { width, height, display: 'block', touchAction: 'none' },
    'aria-label': t('map.floor'),
  });
}
