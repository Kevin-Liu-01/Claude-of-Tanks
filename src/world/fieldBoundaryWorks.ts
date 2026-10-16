// src/world/fieldBoundaryWorks.ts — the field boundaries' works in a props build (physics stream, 2026-10-15: moved out of
// props.ts byte for byte under the coordinator's token, extract-then-own): placeFieldBoundaryWorks lays the land use's
// dry-stone walls and earth banks (world/scenery.ts composeFieldWorks) once every solid is final, and createFieldWallLod
// switches the walls' cells between their far, near and stone forms by the camera's distance. props.ts keeps the calls.
import * as THREE from 'three';
import { resolvePresetName } from '../engine/quality.ts';
import { buildFieldWallFineSteps, type FieldWallFineSource } from './fieldWorks.ts';
import type { DestructibleRecord, PropsBuildSlice, PropsMapConfig } from './props.ts';
import type { CollisionRecord } from './collision.ts';
import { CrushableClutter } from './crushableClutter.ts';
import { FieldWallCrush, fieldWallSpans } from './fieldWallCollision.ts';
import { composeFieldWorks } from './scenery.ts';
import type { SceneryMapConfig } from './sceneryPlan.ts';
import { applyStoneWallHook } from './stoneWallShader.ts';
import { yardStructureKinds } from './yardDressing.ts';

type SceneryHardstand = { x: number; z: number; width: number; length: number; yawDeg?: number };
type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];
type MaterialShaderHook = (shader: MaterialShader) => void;
type FieldWorksInput = Parameters<typeof composeFieldWorks>[0];

/** The field walls' cells and their two batches, the near form's and the far form's (b13; updateFieldWallLod). */
export interface FieldWallLod {
  near: THREE.BatchedMesh | null;
  far: THREE.BatchedMesh | null;
  cells: Array<{
    box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }; near: number; far: number; nearShown: boolean;
    /** (b17) The cell's key, and its stone form while the camera is near (built on demand; false: built, nothing in it). */
    key: number; stones: THREE.Mesh | false | null; midShown: boolean;
  }>;
  /** (b17) What the stone forms are built from (null on a phone), and the walls' material they share. */
  fine: FieldWallFineSource | null;
  material: THREE.Material;
  /** (b17) The cells that want their stone form and have none yet, at the last switch (map.ts getFieldWallWorkState). */
  pending?: number;
  /** (PH.15) The crushed spans' press, which a stone form takes as it is built (fieldWallCollision.ts). */
  crush?: FieldWallCrush;
}

/** What the field works read of a props build (props.ts propsBuildSteps' own locals). */
export interface FieldBoundaryWorksContext {
  cfg: PropsMapConfig | null;
  mapId: string;
  heightField: FieldWorksInput['heightField'];
  L: { spawns: { player: { x: number; z: number }; enemies: ReadonlyArray<{ x: number; z: number }> } };
  obstacles: FieldWorksInput['obstacles'];
  /** The shells' records and the destructibles (a crushable's network identity is its index there). */
  colliders: CollisionRecord[];
  destructibles: DestructibleRecord[];
  sceneryTrees: FieldWorksInput['trees'];
  seed: number;
  mobileProps: boolean;
  buildingFeatures: ReadonlyArray<{ x: number; z: number; w: number; d: number; kind?: string }>;
  group: THREE.Group;
  aniso: number;
  engineCtx: { setupShadowMaterial(material: THREE.Material, hook?: MaterialShaderHook | null): void };
  grimeHook: MaterialShaderHook;
  stoneShape: THREE.IUniform<THREE.Vector4>;
  retainedSurfaceMaterials: THREE.Material[];
  mats: Record<string, THREE.MeshStandardMaterial>;
  makeDryWall: (anisotropy: number, size: number) => Generator<PropsBuildSlice, { albedo: THREE.Texture; normal: THREE.Texture; surface: THREE.Texture }, void>;
}

/** The field boundaries' walls and banks of one props build (props.ts calls it after the pools' refit). */
export function* placeFieldBoundaryWorks(context: FieldBoundaryWorksContext): Generator<PropsBuildSlice, void, void> {
  const {
    cfg, mapId, heightField, L, obstacles, colliders, destructibles, sceneryTrees, seed, mobileProps, buildingFeatures, group,
    aniso, engineCtx, grimeHook, stoneShape, retainedSurfaceMaterials, mats, makeDryWall,
  } = context;
  // the scenery lane (2026-10-03): the field boundaries' walls and banks (world/scenery.ts composeFieldWorks), once
  // every solid is final — the pools' refit above reshapes the buildings' records, and the works keep off the objective
  // discs where the match placement seats them on these very solids — and off the aprons and the yards (the yard
  // structures, as placeYardDressing reads them). Low and long, grounded by their own shading and dark foot (no shadow).
  function* placeFieldBoundaryWorks(): Generator<PropsBuildSlice, void, void> {
    const scenery = (cfg as (PropsMapConfig & SceneryMapConfig) | null)?.scenery;
    if (!scenery?.fieldWorks) return;
    const yardKinds = new Set(yardStructureKinds());
    const built = yield* composeFieldWorks({
      mapId, scenery, heightField, spawns: [L.spawns.player, ...L.spawns.enemies], obstacles, trees: sceneryTrees,
      seed, mobile: mobileProps,
      hardstands: (cfg as { terrain?: { hardstands?: SceneryHardstand[] } } | null)?.terrain?.hardstands ?? [],
      yards: buildingFeatures.filter((b) => b.kind && yardKinds.has(b.kind)).map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d })),
    });
    const receipt = group.userData.scenery as { fieldWorks?: unknown } | undefined;
    if (receipt && built.receipt) receipt.fieldWorks = built.receipt;
    // (physics stream PH.15) the walls' crushable spans: shells and sight stop on the stone, a hull crushes it and is never
    // stopped (fieldWallCollision.ts), the desktop's records on every tier; appended after every other destructible
    const wallGround = (x: number, z: number): number => (heightField.getHeightAtFast ? heightField.getHeightAtFast(x, z) : heightField.getHeightAt(x, z));
    const wallCrush = new FieldWallCrush(wallGround);
    for (const span of built.walls ? fieldWallSpans(built.walls.lines, built.walls.noise, wallGround) : []) {
      const clutter = new CrushableClutter('field-wall', span.cx, span.y, span.cz, span.halfAlong, span.h, [span.obstacle], [span.collider]);
      obstacles.push(span.obstacle); colliders.push(span.collider);
      if (!clutter.activate(destructibles.length)) continue;
      destructibles.push({ kind: clutter.kind, cls: 'break', x: clutter.x, y: clutter.y, z: clutter.z, yaw: 0, sc: 1, r: clutter.r, h: clutter.h,
        slot: -1, state: 0, ob: span.obstacle, col: span.collider, groundSupport: null, clutter });
      clutter.crushHooks.push((crushed) => wallCrush.press(span, crushed));
    }
    if (!built.wallCells.length && !built.bankGeometry) return;
    // (b13: the walls on their own dry stone — the face print, a lit material on the cascades like every other; the
    // banks on the rock material)
    const place = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string): void => {
      const works = new THREE.Mesh(geometry, material);
      works.name = name;
      works.castShadow = false;
      works.receiveShadow = true;
      works.matrixAutoUpdate = false;
      group.add(works);
    };
    if (built.wallCells.length) {
      const print = yield* makeDryWall(aniso, mobileProps ? 256 : 512);
      const wallMaterial = new THREE.MeshStandardMaterial({
        map: print.albedo, normalMap: print.normal, roughnessMap: print.surface, aoMap: print.surface,
        vertexColors: true, roughness: 1, metalness: 0,
      });
      wallMaterial.name = 'props-field-walls';
      // (b14, wave 97: "uniform polygon cells": the print's two-metre tile varies by world place under the props' grime,
      // and lichen grows by world place, as on the dry-stone modules)
      engineCtx.setupShadowMaterial(wallMaterial, (shader) => { grimeHook(shader); applyStoneWallHook(shader, stoneShape); });
      wallMaterial.customProgramCacheKey = () => 'world-props-field-walls-v1';
      retainedSurfaceMaterials.push(wallMaterial);
      // (the coordinator, after the first b13 count: "full stones within a near radius, merged per cell, with a simpler
      // mid and far form"; the joinery's law) the walls by 64 m cell: two batches of one draw each, the near form's and
      // the far form's, one instance a cell in each; a cell shows its near form within the quality's near distance of
      // the camera (updateFieldWallLod) and its far form past it. Every far instance starts shown, every near one hidden
      // (the same material and program: the far draw links it for both)
      const batchOf = (forms: Array<THREE.BufferGeometry | null>, name: string) => {
        const list = forms.filter((g): g is THREE.BufferGeometry => !!g);
        if (!list.length) return null;
        const vertices = list.reduce((n, g) => n + g.getAttribute('position').count, 0);
        const indices = list.reduce((n, g) => n + (g.index ? g.index.count : 0), 0);
        const batch = new THREE.BatchedMesh(list.length, vertices, Math.max(1, indices), wallMaterial);
        batch.name = name;
        batch.sortObjects = false;
        // (b13's cost hold, Saltwind chase: the walls drew every cell's far form, behind the camera too; a cell outside
        // the frustum is culled, a few hundred sphere tests a frame against the draws they save)
        batch.perObjectFrustumCulled = true;
        batch.castShadow = false;
        batch.receiveShadow = true;
        batch.matrixAutoUpdate = false;
        const ids = forms.map((g) => (g ? batch.addInstance(batch.addGeometry(g)) : -1));
        for (const g of list) g.dispose();
        group.add(batch);
        return { batch, ids };
      };
      const near = batchOf(built.wallCells.map((c) => c.near), 'props-field-works');
      const far = batchOf(built.wallCells.map((c) => c.far), 'props-field-works-far');
      const cells = built.wallCells.map((c, i) => ({ box: c.box, near: near ? near.ids[i] : -1, far: far ? far.ids[i] : -1, nearShown: false,
        key: c.key, stones: null, midShown: false }));
      for (const cell of cells) if (near && cell.near >= 0) near.batch.setVisibleAt(cell.near, false);
      // (the switch reads the cells through the group, as the fine joinery's does: updateFieldWallLod)
      group.userData.fieldWallLod = { near: near?.batch ?? null, far: far?.batch ?? null, cells, fine: built.fine, material: wallMaterial } satisfies FieldWallLod;
      // (PH.15) a crushed span pressed in the mid and far forms, and in the stone forms shown
      if (near) wallCrush.bindBatch(near.batch, cells.map((cell) => ({ box: cell.box, instance: cell.near })));
      if (far) wallCrush.bindBatch(far.batch, cells.map((cell) => ({ box: cell.box, instance: cell.far })));
      wallCrush.bindStones(function* () {
        for (const cell of cells as FieldWallLod['cells']) if (cell.stones) yield { box: cell.box, geometry: cell.stones.geometry };
      });
      (group.userData.fieldWallLod as FieldWallLod).crush = wallCrush;
    }
    if (built.bankGeometry) place(built.bankGeometry, mats.rock, built.wallCells.length ? 'props-field-banks' : 'props-field-works');
  }
  yield* placeFieldBoundaryWorks();
}

/** The field walls' level-of-detail switch of one props build (props.ts updateProps calls it every frame). */
export function createFieldWallLod(group: THREE.Group): (cameraPos: THREE.Vector3 | null) => void {
  // the scenery lane (b13): the field walls' cells, their near form within the quality's near distance of the camera
  // (3D, to the cell's box), their far form past it, 10 m of hysteresis; the preset re-read once a second. At High a
  // top stone's 5 cm step is under half a pixel at 80 m (the cost hold's chase view read 100 m's near cells).
  const FIELD_WALL_NEAR_M: Readonly<Record<string, number>> = {
    ultra: 110, high: 80, medium: 65, low: 50, ultralow: 30, 'mobile-high': 45, mobile: 35, 'mobile-low': 25,
    'mobile-ultralow': 20, // Ultra Low (2026-10-13): the wall's far form (the same wall, the same cover) from 30 m
  };
  // (b17; gauntlet wave 121, Saltwind's walls "a smooth extruded strip ... mortared, not dry-stone") within a nearer
  // distance still a cell draws its stone form (fieldWorks.ts buildFieldWallFineSteps: every stone, its joints, the
  // through-stones, the coping), built when the camera comes within it — one cell at a time, a few milliseconds a frame,
  // its mid form showing until it is done — and let go when it leaves (8 m of hysteresis); its mid form hides while it
  // shows. Every cell's stone form at once would hold millions of triangles (Saltwind: 4.2 M), so only the few near the
  // camera are ever built. None on a phone, none at Low.
  // (at High a stone is ten pixels tall at 30 m, a cell's box within 30 m of the camera is one to four cells, 20-25 k
  // triangles each on Saltwind: the mid form takes over past it)
  const FIELD_WALL_FINE_M: Readonly<Record<string, number>> = {
    ultra: 45, high: 30, medium: 22, low: 0, ultralow: 0, 'mobile-high': 0, mobile: 0, 'mobile-low': 0, 'mobile-ultralow': 0,
  };
  /** A frame's share of the stone form being built (ms). */
  const FIELD_WALL_STONE_BUDGET_MS = 2;
  type WallCell = FieldWallLod['cells'][number];
  let wallJob: { cell: WallCell; steps: Generator<unknown, THREE.BufferGeometry | null, void> } | null = null;
  let wallNear = 80, wallFine = 45, wallFrames = 0;
  function updateFieldWallLod(cameraPos: THREE.Vector3 | null): void {
    const lod = group.userData.fieldWallLod as FieldWallLod | undefined;
    if (!lod || !cameraPos) return;
    if (wallFrames-- <= 0) {
      const preset = resolvePresetName();
      wallNear = FIELD_WALL_NEAR_M[preset] ?? 80; wallFine = lod.fine ? FIELD_WALL_FINE_M[preset] ?? 0 : 0; wallFrames = 60;
    }
    const { near, far, cells } = lod;
    // the stone form being built: a few milliseconds of it a frame
    if (wallJob) {
      const start = performance.now();
      let step = wallJob.steps.next();
      while (!step.done && performance.now() - start < FIELD_WALL_STONE_BUDGET_MS) step = wallJob.steps.next();
      if (step.done) {
        const { cell } = wallJob, g = step.value;
        wallJob = null;
        if (g) {
          lod.crush?.pressBuilt(g, cell.box); // (PH.15: the crushed spans over it)
          const mesh = new THREE.Mesh(g, lod.material);
          mesh.name = 'props-field-works-stones';
          mesh.castShadow = false; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
          group.add(mesh);
          cell.stones = mesh;
        } else cell.stones = false;
      }
    }
    let pending = 0;
    for (const cell of cells) {
      const b = cell.box;
      const dx = Math.max(b.minX - cameraPos.x, 0, cameraPos.x - b.maxX);
      const dy = Math.max(b.minY - cameraPos.y, 0, cameraPos.y - b.maxY);
      const dz = Math.max(b.minZ - cameraPos.z, 0, cameraPos.z - b.maxZ);
      const d = Math.hypot(dx, dy, dz);
      const wantStones = wallFine > 0 && (cell.stones ? d < wallFine + 8 : d < wallFine + (wallJob?.cell === cell ? 8 : 0));
      if (wantStones && cell.stones === null && !wallJob && lod.fine) {
        wallJob = { cell, steps: buildFieldWallFineSteps(lod.fine, cell.key) };
      } else if (!wantStones && wallJob?.cell === cell) {
        wallJob.steps.return(null); // (the camera turned away before it was done)
        wallJob = null;
      } else if (!wantStones && cell.stones !== null) {
        if (cell.stones) { group.remove(cell.stones); cell.stones.geometry.dispose(); }
        cell.stones = null;
      }
      if (wantStones && cell.stones === null) pending++;
      const show = cell.nearShown ? d < wallNear + 10 : d < wallNear;
      const midShown = show && !cell.stones;
      if (midShown !== cell.midShown) { cell.midShown = midShown; if (near && cell.near >= 0) near.setVisibleAt(cell.near, midShown); }
      if (show === cell.nearShown) continue;
      cell.nearShown = show;
      if (far && cell.far >= 0) far.setVisibleAt(cell.far, !show);
    }
    lod.pending = pending;
  }
  return updateFieldWallLod;
}
