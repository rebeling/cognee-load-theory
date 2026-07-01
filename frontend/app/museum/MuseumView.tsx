"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import type { GraphNode } from "../lib/api";
import styles from "./museum.module.css";

type Edge = { source: number | string; target: number | string; label: string };
type Props = { nodes: GraphNode[]; edges: Edge[] };

const TYPE_COLORS: Record<string, string> = {
  Entity: "#7dd3fc",
  EntityType: "#c4b5fd",
  TextSummary: "#fcd34d",
  DocumentChunk: "#86efac",
  TextDocument: "#f9a8d4",
};
const DEFAULT_COLOR = "#9ca3af";
const colorFor = (t: string) => TYPE_COLORS[t] ?? DEFAULT_COLOR;

const STATUE_TYPES = new Set(["TextDocument", "DocumentChunk", "TextSummary"]);
const TYPE_ORDER = [
  "EntityType",
  "Entity",
  "TextDocument",
  "DocumentChunk",
  "TextSummary",
];

function displayName(n: GraphNode): string {
  const m = n.label.match(/^([A-Za-z]+)_[0-9a-fA-F-]{8,}$/);
  return m ? m[1] : n.label;
}
function descOf(n: GraphNode): string {
  const d = n.properties?.description;
  const t = n.properties?.text;
  if (typeof d === "string" && d && d !== displayName(n)) return d;
  if (typeof t === "string" && t) return t;
  return n.type;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFrom(s: string): number {
  return (
    Math.abs(
      s.split("").reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7),
    ) % 1_000_000
  );
}

// Reconstruct edges: real graph edges, plus any property whose value is another node id.
function buildEdges(nodes: GraphNode[], edges: Edge[]) {
  const ids = new Set(nodes.map((n) => String(n.id)));
  const out: { a: string; b: string; label: string }[] = [];
  const seen = new Set<string>();
  const add = (a: string, b: string, label: string) => {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (a === b || seen.has(key)) return;
    seen.add(key);
    out.push({ a, b, label });
  };
  for (const e of edges) add(String(e.source), String(e.target), e.label || "");
  for (const n of nodes) {
    const p = n.properties || {};
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === "string" && ids.has(v)) add(String(n.id), v, k);
    }
  }
  return out;
}

// --- Procedural canvas helpers ---
function makeArtwork(label: string, hex: string, seed: number): THREE.CanvasTexture {
  const W = 512;
  const H = 384;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const rand = mulberry32(seed);
  const col = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);

  // background gradient
  const g = ctx.createLinearGradient(0, 0, W, H);
  const bg = new THREE.Color().setHSL(hsl.h, hsl.s * 0.5, 0.08);
  const bg2 = new THREE.Color().setHSL((hsl.h + 0.5) % 1, hsl.s * 0.4, 0.05);
  g.addColorStop(0, `#${bg.getHexString()}`);
  g.addColorStop(1, `#${bg2.getHexString()}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // soft abstract blobs
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 26; i++) {
    const hue = (hsl.h + (rand() - 0.5) * 0.18 + 1) % 1;
    const cc = new THREE.Color().setHSL(hue, 0.6 + rand() * 0.3, 0.35 + rand() * 0.3);
    const x = rand() * W;
    const y = rand() * H;
    const r = 30 + rand() * 150;
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, `rgba(${(cc.r * 255) | 0},${(cc.g * 255) | 0},${(cc.b * 255) | 0},${0.18 + rand() * 0.25})`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // a few decisive strokes
  for (let i = 0; i < 5; i++) {
    const cc = new THREE.Color().setHSL((hsl.h + (rand() - 0.5) * 0.1 + 1) % 1, 0.7, 0.6);
    ctx.strokeStyle = `rgba(${(cc.r * 255) | 0},${(cc.g * 255) | 0},${(cc.b * 255) | 0},0.5)`;
    ctx.lineWidth = 2 + rand() * 8;
    ctx.beginPath();
    ctx.moveTo(rand() * W, rand() * H);
    ctx.bezierCurveTo(rand() * W, rand() * H, rand() * W, rand() * H, rand() * W, rand() * H);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makePlate(title: string, sub: string): THREE.CanvasTexture {
  const W = 512;
  const H = 160;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#0d0f14";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#e8eaf0";
  ctx.font = "bold 40px Georgia, serif";
  ctx.textBaseline = "middle";
  const t = title.length > 26 ? title.slice(0, 25) + "…" : title;
  ctx.fillText(t, 24, 56);
  ctx.fillStyle = "#8a92a6";
  ctx.font = "italic 28px Georgia, serif";
  const s = sub.length > 40 ? sub.slice(0, 39) + "…" : sub;
  ctx.fillText(s, 24, 112);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSign(text: string, hex: string): THREE.CanvasTexture {
  const W = 512;
  const H = 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgba(10,11,15,0.92)";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = hex;
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, W - 12, H - 12);
  ctx.fillStyle = "#f1f3f8";
  ctx.font = "bold 56px Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), W / 2, H / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFloorTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement("canvas");
  c.width = S;
  c.height = S;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#23252c";
  ctx.fillRect(0, 0, S, S);
  // faint marble mottling
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.03})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(Math.random() * S, Math.random() * S);
    ctx.bezierCurveTo(
      Math.random() * S, Math.random() * S,
      Math.random() * S, Math.random() * S,
      Math.random() * S, Math.random() * S,
    );
    ctx.stroke();
  }
  // tile grout
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export default function MuseumView({ nodes, edges }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [locked, setLocked] = useState(false);
  const [target, setTarget] = useState<{
    name: string;
    type: string;
    desc: string;
    links: string[];
  } | null>(null);
  const lockApi = useRef<{ lock: () => void } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const links = buildEdges(nodes, edges);
    const linkCount = new Map<string, number>();
    const linkNames = new Map<string, string[]>();
    const byId = new Map(nodes.map((n) => [String(n.id), n]));
    for (const e of links) {
      linkCount.set(e.a, (linkCount.get(e.a) ?? 0) + 1);
      linkCount.set(e.b, (linkCount.get(e.b) ?? 0) + 1);
      const na = byId.get(e.a),
        nb = byId.get(e.b);
      if (na && nb) {
        linkNames.set(e.a, [...(linkNames.get(e.a) ?? []), displayName(nb)]);
        linkNames.set(e.b, [...(linkNames.get(e.b) ?? []), displayName(na)]);
      }
    }

    let width = mount.clientWidth || 800;
    let height = mount.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06070a);
    scene.fog = new THREE.Fog(0x06070a, 34, 150);

    const camera = new THREE.PerspectiveCamera(70, width / height, 0.1, 500);
    const EYE = 1.7;
    camera.position.set(0, EYE, 2);
    camera.lookAt(0, EYE, 20); // face down the gallery (+z)

    const controls = new PointerLockControls(camera, renderer.domElement);
    lockApi.current = { lock: () => controls.lock() };
    controls.addEventListener("lock", () => setLocked(true));
    controls.addEventListener("unlock", () => setLocked(false));

    // --- Lights ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.7);
    d1.position.set(6, 12, 4);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(0x88aaff, 0.4);
    d2.position.set(-6, 8, -10);
    scene.add(d2);

    const disposables: { dispose(): void }[] = [];
    const exhibits: THREE.Mesh[] = []; // raycast targets
    const exhibitData: {
      name: string;
      type: string;
      desc: string;
      links: string[];
    }[] = [];
    const worldPos = new Map<string, THREE.Vector3>(); // node id -> exhibit position

    // --- Geometry constants ---
    const CW = 5; // corridor half width
    const WALL_H = 5;
    const startZ = 5;
    const spacing = 4.4;
    const groupGap = 3.2;

    const floorTex = makeFloorTexture();
    disposables.push(floorTex);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x14161c,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x0b0c10,
      roughness: 1,
      side: THREE.DoubleSide,
    });
    disposables.push(wallMat, ceilMat);

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x3a2f1c,
      roughness: 0.6,
      metalness: 0.4,
    });
    const plateMatBase = new THREE.MeshStandardMaterial({
      color: 0x222530,
      roughness: 0.7,
    });
    disposables.push(frameMat, plateMatBase);

    const sharedQuad = new THREE.PlaneGeometry(1, 1);
    disposables.push(sharedQuad);

    function hangPainting(n: GraphNode, side: 1 | -1, z: number) {
      const hex = colorFor(n.type);
      const seed = seedFrom(String(n.id));
      const x = side * (CW - 0.06);
      const y = 2.5;
      const ROTY = side === -1 ? Math.PI / 2 : -Math.PI / 2;

      // frame
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.95, 2.55), frameMat);
      frame.position.set(x + side * 0.02, y, z);
      scene.add(frame);
      disposables.push((frame.geometry as THREE.BufferGeometry));

      // artwork
      const art = makeArtwork(displayName(n), hex, seed);
      disposables.push(art);
      const artMat = new THREE.MeshBasicMaterial({ map: art });
      const painting = new THREE.Mesh(sharedQuad, artMat);
      painting.scale.set(2.3, 1.7, 1);
      painting.position.set(x, y, z);
      painting.rotation.y = ROTY;
      scene.add(painting);
      disposables.push(artMat);
      exhibits.push(painting);
      exhibitData.push({
        name: displayName(n),
        type: n.type,
        desc: descOf(n),
        links: linkNames.get(String(n.id)) ?? [],
      });
      worldPos.set(String(n.id), painting.position.clone());

      // nameplate
      const plate = makePlate(displayName(n), n.type);
      disposables.push(plate);
      const plMat = new THREE.MeshBasicMaterial({ map: plate });
      const plaque = new THREE.Mesh(sharedQuad, plMat);
      plaque.scale.set(1.3, 0.4, 1);
      plaque.position.set(x, 1.3, z);
      plaque.rotation.y = ROTY;
      scene.add(plaque);
      disposables.push(plMat);

      // little accent spotlight glow on wall (cheap: emissive strip)
      const accent = new THREE.Mesh(
        sharedQuad,
        new THREE.MeshBasicMaterial({
          color: hex,
          transparent: true,
          opacity: 0.12,
        }),
      );
      accent.scale.set(2.8, 0.06, 1);
      accent.position.set(x - side * 0.01, 3.6, z);
      accent.rotation.y = ROTY;
      scene.add(accent);
      disposables.push((accent.material as THREE.Material));
    }

    function ceilingSign(text: string, hex: string, z: number) {
      const tex = makeSign(text, hex);
      disposables.push(tex);
      const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
      const sign = new THREE.Mesh(sharedQuad, m);
      sign.scale.set(3.2, 0.8, 1);
      sign.position.set(0, 4.1, z);
      scene.add(sign);
      disposables.push(m);
    }

    // --- Lay out paintings (corridor) ---
    const grouped = TYPE_ORDER.map((t) => ({
      t,
      list: nodes.filter((n) => n.type === t && !STATUE_TYPES.has(n.type)),
    })).filter((g) => g.list.length);

    let z = startZ;
    for (const grp of grouped) {
      ceilingSign(grp.t, colorFor(grp.t), z - groupGap * 0.5);
      for (let i = 0; i < grp.list.length; i += 2) {
        hangPainting(grp.list[i], -1, z);
        if (grp.list[i + 1]) hangPainting(grp.list[i + 1], 1, z);
        z += spacing;
      }
      z += groupGap;
    }
    const corridorEndZ = z + 1;

    // --- Rotunda (statues) ---
    const ROT_HALF = 11;
    const ROT_DEPTH = 24;
    const rotStartZ = corridorEndZ;
    const rotEndZ = rotStartZ + ROT_DEPTH;
    const rotCenter = new THREE.Vector3(0, 0, rotStartZ + ROT_DEPTH / 2);

    const statueNodes = nodes.filter((n) => STATUE_TYPES.has(n.type));
    statueNodes.forEach((n, i) => {
      const hex = colorFor(n.type);
      const ang = (i / Math.max(1, statueNodes.length)) * Math.PI * 2;
      const rr = statueNodes.length > 1 ? 6 : 0;
      const px = Math.cos(ang) * rr;
      const pz = rotCenter.z + Math.sin(ang) * rr;

      // pedestal
      const ped = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.85, 1.4, 24),
        new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.8 }),
      );
      ped.position.set(px, 0.7, pz);
      scene.add(ped);
      disposables.push(ped.geometry as THREE.BufferGeometry, ped.material as THREE.Material);

      // gem statue
      const gemGeo = new THREE.IcosahedronGeometry(0.85, 0);
      const gemMat = new THREE.MeshStandardMaterial({
        color: hex,
        emissive: new THREE.Color(hex),
        emissiveIntensity: 0.4,
        roughness: 0.25,
        metalness: 0.6,
        flatShading: true,
      });
      const gem = new THREE.Mesh(gemGeo, gemMat);
      gem.position.set(px, 2.1, pz);
      gem.userData.spin = 0.005 + (i % 3) * 0.002;
      scene.add(gem);
      disposables.push(gemGeo, gemMat);
      exhibits.push(gem);
      exhibitData.push({
        name: displayName(n),
        type: n.type,
        desc: descOf(n),
        links: linkNames.get(String(n.id)) ?? [],
      });
      worldPos.set(String(n.id), gem.position.clone());

      // pedestal light
      const pl = new THREE.PointLight(new THREE.Color(hex), 0.8, 12, 2);
      pl.position.set(px, 3.4, pz);
      scene.add(pl);

      // floating plate
      const plate = makePlate(displayName(n), n.type);
      disposables.push(plate);
      const plMat = new THREE.MeshBasicMaterial({ map: plate, transparent: true });
      const plaque = new THREE.Mesh(sharedQuad, plMat);
      plaque.scale.set(1.6, 0.5, 1);
      plaque.position.set(px, 1.25, pz + 0.95);
      scene.add(plaque);
      disposables.push(plMat);
    });

    ceilingSign("Lineage", "#ffffff", rotStartZ + 1.5);

    // --- Connection threads ---
    let threadMat: THREE.LineBasicMaterial | null = null;
    if (links.length) {
      threadMat = new THREE.LineBasicMaterial({
        color: 0xff5566,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const pts: number[] = [];
      let drawn = 0;
      for (const e of links) {
        const pa = worldPos.get(e.a);
        const pb = worldPos.get(e.b);
        if (!pa || !pb) continue;
        pts.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
        drawn++;
      }
      if (drawn) {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        scene.add(new THREE.LineSegments(lg, threadMat));
        disposables.push(lg, threadMat);
      }
    }

    // --- Shell: floor, ceiling, walls ---
    const totalLen = rotEndZ + 4;
    floorTex.repeat.set(8, Math.ceil(totalLen / 3));
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROT_HALF * 2 + 4, totalLen),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0.1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, totalLen / 2);
    scene.add(floor);
    disposables.push(floor.geometry as THREE.BufferGeometry, floor.material as THREE.Material);

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(ROT_HALF * 2 + 4, totalLen),
      ceilMat,
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, WALL_H, totalLen / 2);
    scene.add(ceil);
    disposables.push(ceil.geometry as THREE.BufferGeometry);

    function wall(w: number, h: number, pos: THREE.Vector3, roty: number) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.copy(pos);
      m.rotation.y = roty;
      scene.add(m);
      disposables.push(m.geometry as THREE.BufferGeometry);
    }
    // corridor side walls
    wall(corridorEndZ, WALL_H, new THREE.Vector3(-CW, WALL_H / 2, corridorEndZ / 2), Math.PI / 2);
    wall(corridorEndZ, WALL_H, new THREE.Vector3(CW, WALL_H / 2, corridorEndZ / 2), Math.PI / 2);
    // entrance back wall
    wall(CW * 2, WALL_H, new THREE.Vector3(0, WALL_H / 2, 0), 0);
    // rotunda walls
    wall(ROT_HALF * 2, WALL_H, new THREE.Vector3(0, WALL_H / 2, rotEndZ), 0); // back
    wall(ROT_DEPTH, WALL_H, new THREE.Vector3(-ROT_HALF, WALL_H / 2, rotStartZ + ROT_DEPTH / 2), Math.PI / 2);
    wall(ROT_DEPTH, WALL_H, new THREE.Vector3(ROT_HALF, WALL_H / 2, rotStartZ + ROT_DEPTH / 2), Math.PI / 2);
    // rotunda front wall (two segments leaving corridor-width doorway)
    const segW = ROT_HALF - CW;
    wall(segW, WALL_H, new THREE.Vector3(-(CW + segW / 2), WALL_H / 2, rotStartZ), 0);
    wall(segW, WALL_H, new THREE.Vector3(CW + segW / 2, WALL_H / 2, rotStartZ), 0);

    // --- Movement ---
    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => keys.add(e.code);
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);

    function clampPos() {
      const p = camera.position;
      p.y = EYE;
      const margin = 0.6;
      if (p.z < corridorEndZ) {
        p.x = Math.max(-CW + margin, Math.min(CW - margin, p.x));
      } else {
        p.x = Math.max(-ROT_HALF + margin, Math.min(ROT_HALF - margin, p.x));
      }
      p.z = Math.max(0.8, Math.min(rotEndZ - margin, p.z));
    }

    // --- Raycast (center of view) ---
    const raycaster = new THREE.Raycaster();
    raycaster.far = 14;
    const center = new THREE.Vector2(0, 0);
    let lastTarget = -1;

    const clock = new THREE.Clock();
    let raf = 0;
    const SPEED = 6;
    const gems = exhibits.filter((m) => m.userData.spin);

    const animate = () => {
      const dt = Math.min(0.05, clock.getDelta());
      if (controls.isLocked) {
        let f = 0,
          s = 0;
        if (keys.has("KeyW") || keys.has("ArrowUp")) f += 1;
        if (keys.has("KeyS") || keys.has("ArrowDown")) f -= 1;
        if (keys.has("KeyD") || keys.has("ArrowRight")) s += 1;
        if (keys.has("KeyA") || keys.has("ArrowLeft")) s -= 1;
        if (f || s) {
          const len = Math.hypot(f, s) || 1;
          controls.moveForward((f / len) * SPEED * dt);
          controls.moveRight((s / len) * SPEED * dt);
          clampPos();
        }
      }
      for (const g of gems) g.rotation.y += g.userData.spin as number;

      // center raycast
      raycaster.setFromCamera(center, camera);
      const hit = raycaster.intersectObjects(exhibits, false)[0];
      const idx = hit ? exhibits.indexOf(hit.object as THREE.Mesh) : -1;
      if (idx !== lastTarget) {
        lastTarget = idx;
        setTarget(idx >= 0 ? exhibitData[idx] : null);
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    const ro = new ResizeObserver(() => {
      width = mount.clientWidth || width;
      height = mount.clientHeight || height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      controls.dispose();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      lockApi.current = null;
    };
  }, [nodes, edges]);

  return (
    <div className={styles.canvasWrap}>
      <div ref={mountRef} className={styles.mount} />

      {/* crosshair */}
      {locked && <div className={styles.reticle} />}

      {/* targeted exhibit HUD */}
      {locked && target && (
        <div className={styles.hud}>
          <span className={styles.hudType} style={{ color: colorFor(target.type) }}>
            {target.type}
          </span>
          <strong className={styles.hudName}>{target.name}</strong>
          <p className={styles.hudDesc}>
            {target.desc.length > 180 ? target.desc.slice(0, 180) + "…" : target.desc}
          </p>
          {target.links.length > 0 && (
            <p className={styles.hudLinks}>
              ↔ connected to: {target.links.slice(0, 6).join(", ")}
              {target.links.length > 6 ? ` +${target.links.length - 6}` : ""}
            </p>
          )}
        </div>
      )}

      {/* enter overlay */}
      {!locked && (
        <div className={styles.overlay} onClick={() => lockApi.current?.lock()}>
          <div className={styles.card}>
            <h2>Enter the Cognee Museum</h2>
            <p>Walk through the galleries. Each artwork and statue is a node from the knowledge graph.</p>
            <ul>
              <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</li>
              <li>mouse — look around</li>
              <li>look at an exhibit to read its plaque &amp; connections</li>
              <li><kbd>Esc</kbd> release the mouse</li>
            </ul>
            <button className={styles.enterBtn}>Click to enter</button>
          </div>
        </div>
      )}
    </div>
  );
}
