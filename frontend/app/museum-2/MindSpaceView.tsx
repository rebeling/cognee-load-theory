"use client";

// Museum of Mind — the walkable interface over the cognee graph
// (docs/the-mind-space.md), staged as a bright daylight gallery: parquet
// floor, cream walls, skylights, freestanding partition walls per category,
// framed paintings as exhibits. Lighting = urgency (glow + size), orbit +
// click to fly in and read, selection card with clickable cross-refs, scope
// toggle (content vs. full graph).

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GraphNode } from "../lib/api";
import { buildModel, displayName, descOf, type GraphModel } from "../explore/graphModel";
import styles from "./museum2.module.css";

type Edge = { source: number | string; target: number | string; label: string };
type Props = { nodes: GraphNode[]; edges: Edge[] };
type Scope = "content" | "all";

type Selection = {
  id: string;
  name: string;
  type: string;
  hall: string;
  desc: string;
  deadline: string | null;
  neighbors: { id: string; name: string; kind: string; reason: string }[];
};

// Fixed accents for halls we know from the data; palette for the rest.
const HALL_COLORS: Record<string, string> = {
  person: "#2d7fb8",
  task: "#c07d10",
  event: "#b8447a",
  family: "#3d8f5f",
  location: "#7a5fc0",
  unsorted: "#6b7280",
  archive: "#64748b",
  curator: "#8a6d2f",
};
const PALETTE = ["#b85450", "#5060b8", "#3f9d7a", "#c09a20", "#a050b0", "#3585b5"];
const SCAFFOLD_TYPES = new Set(["TextDocument", "DocumentChunk"]);

const deadlineOf = (n: GraphNode): string | null =>
  descOf(n).match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null;

// ---------------------------------------------------------------------------
// Hall assignment. The live graph often lacks Entity → EntityType edges, so
// halls are inferred: type name in the label wins, then in the description,
// then adopt-the-hall-of-your-closest-kin, else Unsorted.
// ---------------------------------------------------------------------------
function assignHalls(nodes: GraphNode[], model: GraphModel): Map<string, string> {
  const typeNames = nodes
    .filter((n) => n.type === "EntityType")
    .map((n) => n.label.toLowerCase().trim());
  const tokens = (s: string) => s.toLowerCase().split(/[^a-zäöüß0-9]+/);

  const hallOf = new Map<string, string>();
  const entities = nodes.filter((n) => n.type === "Entity");

  for (const n of entities) {
    const id = String(n.id);
    const inLabel = tokens(n.label).find((t) => typeNames.includes(t));
    const inDesc = tokens(descOf(n)).find((t) => typeNames.includes(t));
    if (inLabel) hallOf.set(id, inLabel);
    else if (inDesc) hallOf.set(id, inDesc);
  }

  // Unassigned nodes adopt the hall of whoever they share the most evidence
  // with: model links plus raw token overlap (names like "mertens" are too
  // ubiquitous for the related-link index but are exactly what groups a family).
  const NOISE = new Set(["the", "and", "for", "with", "owner", "unspecified", "due"]);
  const toks = new Map(
    entities.map((n) => [
      String(n.id),
      new Set(
        tokens(`${n.label} ${descOf(n)}`).filter(
          (t) => t.length >= 3 && !NOISE.has(t) && !/^\d+$/.test(t),
        ),
      ),
    ]),
  );
  for (let round = 0; round < 2; round++) {
    for (const n of entities) {
      const id = String(n.id);
      if (hallOf.has(id)) continue;
      const votes = new Map<string, number>();
      for (const c of model.adjacency.get(id) ?? []) {
        const h = hallOf.get(c.id);
        if (h) votes.set(h, (votes.get(h) ?? 0) + c.weight);
      }
      const mine = toks.get(id)!;
      for (const other of entities) {
        const oid = String(other.id);
        const h = hallOf.get(oid);
        if (oid === id || !h) continue;
        let shared = 0;
        for (const t of toks.get(oid)!) if (mine.has(t)) shared++;
        if (shared) votes.set(h, (votes.get(h) ?? 0) + shared);
      }
      const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
      if (top) hallOf.set(id, top[0]);
    }
  }

  for (const n of entities) {
    const id = String(n.id);
    if (!hallOf.has(id)) hallOf.set(id, "unsorted");
  }
  return hallOf;
}

// Urgency in 0..1: deadline proximity (overdue/soonest = brightest), blended
// with the model's priority score and connection count. Drives glow and size.
function urgencyScores(
  placed: GraphNode[],
  model: GraphModel,
  now: number,
): Map<string, number> {
  const spans = placed.map((n) => {
    const d = deadlineOf(n);
    return d ? Date.parse(d) - now : null;
  });
  const future = spans.filter((s): s is number => s !== null && s > 0);
  const maxSpan = future.length ? Math.max(...future) : 1;

  const degs = placed.map((n) => (model.adjacency.get(String(n.id)) ?? []).length);
  const maxDeg = Math.max(1, ...degs);

  const out = new Map<string, number>();
  placed.forEach((n, i) => {
    const span = spans[i];
    const dl = span === null ? 0 : span <= 0 ? 1 : 1 - span / (maxSpan + 1);
    const pr = model.scores.get(String(n.id)) ?? 0.5;
    const dg = degs[i] / maxDeg;
    out.set(String(n.id), Math.min(1, 0.45 * dl + 0.3 * pr + 0.25 * dg));
  });
  return out;
}

// --- procedural texture helpers ---------------------------------------------
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

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// old-master-ish artwork: dark ground, warm figures, per-node deterministic
function makeArtwork(hex: string, seed: number): THREE.CanvasTexture {
  return canvasTexture(512, 384, (ctx) => {
    const W = 512;
    const H = 384;
    const rand = mulberry32(seed);
    const col = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    col.getHSL(hsl);

    const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
    const bg = new THREE.Color().setHSL(hsl.h, 0.35, 0.13);
    const bg2 = new THREE.Color().setHSL((hsl.h + 0.06) % 1, 0.3, 0.07);
    g.addColorStop(0, `#${bg.getHexString()}`);
    g.addColorStop(1, `#${bg2.getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 22; i++) {
      const hue = (hsl.h + (rand() - 0.5) * 0.12 + 1) % 1;
      const cc = new THREE.Color().setHSL(hue, 0.45 + rand() * 0.3, 0.3 + rand() * 0.3);
      const x = rand() * W;
      const y = H * 0.25 + rand() * H * 0.65;
      const r = 20 + rand() * 110;
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(${(cc.r * 255) | 0},${(cc.g * 255) | 0},${(cc.b * 255) | 0},${0.16 + rand() * 0.24})`);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 5; i++) {
      const cc = new THREE.Color().setHSL((hsl.h + (rand() - 0.5) * 0.08 + 1) % 1, 0.55, 0.55);
      ctx.strokeStyle = `rgba(${(cc.r * 255) | 0},${(cc.g * 255) | 0},${(cc.b * 255) | 0},0.45)`;
      ctx.lineWidth = 2 + rand() * 7;
      ctx.beginPath();
      ctx.moveTo(rand() * W, rand() * H);
      ctx.bezierCurveTo(rand() * W, rand() * H, rand() * W, rand() * H, rand() * W, rand() * H);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";

    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  });
}

function makePlate(title: string, sub: string): THREE.CanvasTexture {
  return canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = "#efece5";
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = "#c9c4b8";
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 504, 248);
    ctx.fillStyle = "#26241f";
    ctx.font = "bold 44px Georgia, serif";
    const t = title.length > 22 ? title.slice(0, 21) + "…" : title;
    ctx.fillText(t, 28, 100);
    ctx.fillStyle = "#7a756a";
    ctx.font = "italic 32px Georgia, serif";
    const s = sub.length > 30 ? sub.slice(0, 29) + "…" : sub;
    ctx.fillText(s, 28, 170);
  });
}

function makeHallSign(name: string, count: number, hex: string): THREE.CanvasTexture {
  return canvasTexture(512, 160, (ctx) => {
    ctx.fillStyle = "rgba(250,248,243,0.96)";
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 152, 14);
    ctx.fill();
    ctx.strokeStyle = hex;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = "#2b2820";
    ctx.font = "bold 58px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(name.toUpperCase(), 256, 78);
    ctx.fillStyle = "#8a8577";
    ctx.font = "30px Georgia, serif";
    ctx.fillText(`${count} ${count === 1 ? "work" : "works"}`, 256, 126);
  });
}

function makePlaque(title: string, body: string): THREE.CanvasTexture {
  return canvasTexture(512, 640, (ctx) => {
    ctx.fillStyle = "#f4f1ea";
    ctx.fillRect(0, 0, 512, 640);
    ctx.strokeStyle = "#cfc9bb";
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, 484, 612);
    ctx.fillStyle = "#8a6d2f";
    ctx.font = "bold 30px Georgia, serif";
    ctx.fillText(title, 36, 62);
    ctx.fillStyle = "#3c3931";
    ctx.font = "24px Georgia, serif";
    // simple word wrap
    const words = body.split(/\s+/);
    let line = "";
    let y = 110;
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > 440) {
        ctx.fillText(line, 36, y);
        y += 34;
        line = w;
        if (y > 600) {
          ctx.fillText(line + "…", 36, y);
          return;
        }
      } else {
        line = next;
      }
    }
    if (line) ctx.fillText(line, 36, y);
  });
}

function makeHaloTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,220,150,0.9)");
    g.addColorStop(0.4, "rgba(255,210,130,0.3)");
    g.addColorStop(1, "rgba(255,200,120,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

function makeParquet(): THREE.CanvasTexture {
  const tex = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#c1905c";
    ctx.fillRect(0, 0, 256, 256);
    const rand = mulberry32(1234);
    // planks in alternating direction blocks
    const B = 64;
    for (let bx = 0; bx < 4; bx++) {
      for (let by = 0; by < 4; by++) {
        const horiz = (bx + by) % 2 === 0;
        for (let s = 0; s < 4; s++) {
          const shade = 0.88 + rand() * 0.22;
          ctx.fillStyle = `rgb(${(0xc1 * shade) | 0},${(0x90 * shade) | 0},${(0x5c * shade) | 0})`;
          if (horiz) ctx.fillRect(bx * B, by * B + s * 16, B - 1, 15);
          else ctx.fillRect(bx * B + s * 16, by * B, 15, B - 1);
        }
      }
    }
    ctx.strokeStyle = "rgba(90,60,30,0.25)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 64, 0);
      ctx.lineTo(i * 64, 256);
      ctx.moveTo(0, i * 64);
      ctx.lineTo(256, i * 64);
      ctx.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export default function MindSpaceView({ nodes, edges }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [scope, setScope] = useState<Scope>("content");
  const [sel, setSel] = useState<Selection | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const apiRef = useRef<{ select: (id: string | null) => void; overview: () => void } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const model = buildModel(nodes, edges);
    const hallOf = assignHalls(nodes, model);

    // --- placement plan ---
    const hallNames = [
      ...nodes.filter((n) => n.type === "EntityType").map((n) => n.label.toLowerCase().trim()),
    ];
    const entities = nodes.filter((n) => n.type === "Entity");
    if (entities.some((n) => hallOf.get(String(n.id)) === "unsorted")) hallNames.push("unsorted");
    const scaffold = nodes.filter((n) => SCAFFOLD_TYPES.has(n.type));
    if (scope === "all" && scaffold.length) hallNames.push("archive");

    let halls = hallNames
      .map((name, i) => ({
        name,
        color: HALL_COLORS[name] ?? PALETTE[i % PALETTE.length],
        members:
          name === "archive"
            ? scaffold
            : entities.filter((n) => hallOf.get(String(n.id)) === name),
      }))
      .filter((h) => h.members.length);

    const placed = halls.flatMap((h) => h.members);
    const urgency = urgencyScores(placed, model, Date.now());
    const summaries = nodes.filter((n) => n.type === "TextSummary");

    // the heaviest memory hangs alone on the feature wall (the Night Watch spot)
    const feature = [...entities].sort(
      (a, b) => (urgency.get(String(b.id)) ?? 0) - (urgency.get(String(a.id)) ?? 0),
    )[0];
    if (feature) {
      halls = halls
        .map((h) => ({ ...h, members: h.members.filter((n) => n.id !== feature.id) }))
        .filter((h) => h.members.length);
    }

    // --- renderer / scene / camera ---
    let width = mount.clientWidth || 800;
    let height = mount.clientHeight || 600;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe9e2d3);
    scene.fog = new THREE.Fog(0xe9e2d3, 80, 190);

    // --- gallery dimensions ---
    const SLOT = 3.4; // wall space per painting
    const ROOM_W = 58;
    const ROOM_D = 44;
    const WALL_H = 8.5;

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 600);
    camera.position.set(0, 6.5, ROOM_D / 2 - 3);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 2, -8);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2.5;
    controls.maxDistance = 90;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;

    // --- daylight ---
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0xc7a071, 0.95));
    const sun = new THREE.DirectionalLight(0xffedd0, 1.15);
    sun.position.set(12, 22, 6);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.35);
    fill.position.set(-14, 10, -8);
    scene.add(fill);

    const disposables: { dispose(): void }[] = [];
    const exhibits: THREE.Mesh[] = [];
    const worldPos = new Map<string, THREE.Vector3>();
    const worldNormal = new Map<string, THREE.Vector3>();
    const paintingById = new Map<string, THREE.Mesh>();
    const frameById = new Map<string, THREE.Mesh>();

    const sharedQuad = new THREE.PlaneGeometry(1, 1);
    disposables.push(sharedQuad);

    // --- room shell ---
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf0e9da, roughness: 1 });
    disposables.push(wallMat);
    {
      const parquet = makeParquet();
      parquet.repeat.set(ROOM_W / 6, ROOM_D / 6);
      const fg = new THREE.PlaneGeometry(ROOM_W, ROOM_D);
      const fm = new THREE.MeshStandardMaterial({ map: parquet, roughness: 0.55, metalness: 0.05 });
      const floor = new THREE.Mesh(fg, fm);
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);
      disposables.push(parquet, fg, fm);

      const mkWall = (w: number, pos: THREE.Vector3, roty: number) => {
        const g = new THREE.PlaneGeometry(w, WALL_H);
        const m = new THREE.Mesh(g, wallMat);
        m.position.copy(pos);
        m.rotation.y = roty;
        scene.add(m);
        disposables.push(g);
      };
      mkWall(ROOM_W, new THREE.Vector3(0, WALL_H / 2, -ROOM_D / 2), 0);
      mkWall(ROOM_W, new THREE.Vector3(0, WALL_H / 2, ROOM_D / 2), Math.PI);
      mkWall(ROOM_D, new THREE.Vector3(-ROOM_W / 2, WALL_H / 2, 0), Math.PI / 2);
      mkWall(ROOM_D, new THREE.Vector3(ROOM_W / 2, WALL_H / 2, 0), -Math.PI / 2);

      // clerestory windows along the right wall top
      const skyMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      disposables.push(skyMat);
      for (let i = 0; i < 5; i++) {
        const g = new THREE.PlaneGeometry(5.4, 1.6);
        const win = new THREE.Mesh(g, skyMat);
        win.position.set(ROOM_W / 2 - 0.05, WALL_H - 1.3, -ROOM_D / 2 + 8 + i * 8);
        win.rotation.y = -Math.PI / 2;
        scene.add(win);
        disposables.push(g);
      }
    }

    const haloTex = makeHaloTexture();
    disposables.push(haloTex);
    const partMat = new THREE.MeshStandardMaterial({ color: 0x4c3f2e, roughness: 0.9 });
    const frameGeo = new THREE.BoxGeometry(1, 1, 0.07);
    disposables.push(partMat, frameGeo);

    // --- hang one painting ---
    function hang(n: GraphNode, pos: THREE.Vector3, normal: THREE.Vector3, big = false) {
      const id = String(n.id);
      const heat = urgency.get(id) ?? 0.3;
      const hall = SCAFFOLD_TYPES.has(n.type) ? "archive" : hallOf.get(id) ?? "unsorted";
      const hex = HALL_COLORS[hall] ?? "#6b7280";
      const s = big ? 2.6 : 0.8 + heat * 0.5;
      const w = 2.2 * s;
      const h = 1.6 * s;
      const roty = Math.atan2(normal.x, normal.z);

      // urgency glow behind the frame — lighting = what needs you now
      const glowMat = new THREE.SpriteMaterial({
        map: haloTex,
        transparent: true,
        opacity: 0.1 + heat * 0.5,
        depthWrite: false,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(w * 1.9 + heat * 1.5);
      glow.position.copy(pos).addScaledVector(normal, 0.04);
      scene.add(glow);
      disposables.push(glowMat);

      const frame = new THREE.Mesh(frameGeo, partMat.clone());
      (frame.material as THREE.MeshStandardMaterial).color.set(0x2e2a24);
      frame.scale.set(w + 0.16, h + 0.16, 1);
      frame.position.copy(pos).addScaledVector(normal, 0.045);
      frame.rotation.y = roty;
      scene.add(frame);
      disposables.push(frame.material as THREE.Material);
      frameById.set(id, frame);

      const art = makeArtwork(hex, seedFrom(id));
      const artMat = new THREE.MeshBasicMaterial({ map: art });
      const painting = new THREE.Mesh(sharedQuad, artMat);
      painting.scale.set(w, h, 1);
      painting.position.copy(pos).addScaledVector(normal, 0.09);
      painting.rotation.y = roty;
      painting.userData = { nodeId: id, baseScale: painting.scale.clone() };
      scene.add(painting);
      disposables.push(art, artMat);
      exhibits.push(painting);
      paintingById.set(id, painting);
      worldPos.set(id, painting.position.clone());
      worldNormal.set(id, normal.clone());

      // museum label beside the painting
      const plate = makePlate(displayName(n), deadlineOf(n) ? `due ${deadlineOf(n)}` : n.type);
      const plMat = new THREE.MeshBasicMaterial({ map: plate });
      const plaque = new THREE.Mesh(sharedQuad, plMat);
      plaque.scale.set(big ? 0.9 : 0.62, big ? 0.45 : 0.31, 1);
      const side = new THREE.Vector3(normal.z, 0, -normal.x); // right of the painting
      plaque.position
        .copy(pos)
        .addScaledVector(normal, 0.05)
        .addScaledVector(side, w / 2 + (big ? 0.75 : 0.4));
      plaque.position.y = big ? 1.9 : 1.5;
      plaque.rotation.y = roty;
      scene.add(plaque);
      disposables.push(plate, plMat);
    }

    // --- halls as wall runs: brown panels mounted on the perimeter walls ---
    const FWD = new THREE.Vector3(0, 0, 1);
    {
      const M = 3; // corner margin
      // walk order: back-left, back-right, right wall, left wall, front wall.
      // The back wall center (±7.5) is reserved for the feature painting; the
      // front-left corner is reserved for the curator plaques.
      const segs = [
        { start: new THREE.Vector3(-ROOM_W / 2 + M, 0, -ROOM_D / 2), dir: new THREE.Vector3(1, 0, 0), normal: FWD.clone(), len: ROOM_W / 2 - 7.5 - M },
        { start: new THREE.Vector3(7.5, 0, -ROOM_D / 2), dir: new THREE.Vector3(1, 0, 0), normal: FWD.clone(), len: ROOM_W / 2 - 7.5 - M },
        { start: new THREE.Vector3(ROOM_W / 2, 0, -ROOM_D / 2 + M), dir: new THREE.Vector3(0, 0, 1), normal: new THREE.Vector3(-1, 0, 0), len: ROOM_D - 2 * M },
        { start: new THREE.Vector3(-ROOM_W / 2, 0, ROOM_D / 2 - M), dir: new THREE.Vector3(0, 0, -1), normal: new THREE.Vector3(1, 0, 0), len: ROOM_D - 2 * M },
        { start: new THREE.Vector3(ROOM_W / 2 - M, 0, ROOM_D / 2), dir: new THREE.Vector3(-1, 0, 0), normal: new THREE.Vector3(0, 0, -1), len: ROOM_W / 2 - M + 4 },
      ];
      let si = 0;
      let offset = 0;

      for (const hall of halls) {
        let remaining = [...hall.members];
        let firstChunk = true;
        while (remaining.length) {
          // advance to a segment with room for at least one painting
          while (si < segs.length && segs[si].len - offset < SLOT + 1.4) {
            si++;
            offset = 0;
          }
          if (si >= segs.length) break; // out of wall — shouldn't happen at this scale
          const seg = segs[si];
          const fit = Math.min(
            remaining.length,
            Math.floor((seg.len - offset - 1.4) / SLOT),
          );
          const chunk = remaining.slice(0, fit);
          remaining = remaining.slice(fit);
          const panelW = chunk.length * SLOT + 1.4;
          const centerT = offset + panelW / 2;
          const center = seg.start.clone().addScaledVector(seg.dir, centerT);

          const g = new THREE.BoxGeometry(panelW, 4.3, 0.2);
          const panel = new THREE.Mesh(g, partMat);
          panel.position.set(center.x, 2.15, center.z);
          panel.position.addScaledVector(seg.normal, 0.12);
          panel.rotation.y = Math.atan2(seg.normal.x, seg.normal.z);
          scene.add(panel);
          disposables.push(g);

          if (firstChunk) {
            const signTex = makeHallSign(hall.name, hall.members.length, hall.color);
            const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false });
            const sign = new THREE.Sprite(signMat);
            sign.scale.set(3.4, 1.05, 1);
            sign.position.set(center.x, 5.05, center.z);
            sign.position.addScaledVector(seg.normal, 0.4);
            scene.add(sign);
            disposables.push(signTex, signMat);
            firstChunk = false;
          }

          chunk.forEach((n, i) => {
            const t = offset + 0.7 + SLOT / 2 + i * SLOT;
            const pos = seg.start.clone().addScaledVector(seg.dir, t);
            pos.y = 2.3;
            pos.addScaledVector(seg.normal, 0.55);
            hang(n, pos, seg.normal);
          });
          offset += panelW + 2.2;
        }
      }
    }

    // --- feature wall: the heaviest memory, Night-Watch sized ---
    if (feature) {
      const bg = new THREE.BoxGeometry(11, 5.8, 0.3);
      const back = new THREE.Mesh(bg, partMat);
      back.position.set(0, 2.9, -ROOM_D / 2 + 0.4);
      scene.add(back);
      disposables.push(bg);
      hang(feature, new THREE.Vector3(0, 2.9, -ROOM_D / 2 + 0.9), FWD, true);

      // bench in front
      const benchMat = new THREE.MeshStandardMaterial({ color: 0x99522b, roughness: 0.6 });
      const topG = new THREE.BoxGeometry(3.4, 0.1, 0.55);
      const top = new THREE.Mesh(topG, benchMat);
      top.position.set(0, 0.46, -ROOM_D / 2 + 5.2);
      scene.add(top);
      const legG = new THREE.BoxGeometry(0.09, 0.42, 0.5);
      for (const lx of [-1.5, 1.5]) {
        const leg = new THREE.Mesh(legG, benchMat);
        leg.position.set(lx, 0.21, -ROOM_D / 2 + 5.2);
        scene.add(leg);
      }
      disposables.push(benchMat, topG, legG);

      // a couple of quiet visitors
      const figMat = new THREE.MeshStandardMaterial({ color: 0x3c3c40, roughness: 0.9 });
      const figG = new THREE.CapsuleGeometry(0.26, 1.15, 3, 10);
      for (const [fx, fz] of [
        [1.1, -ROOM_D / 2 + 3.4],
        [ROOM_W / 2 - 6, -ROOM_D / 2 + 9],
      ]) {
        const fig = new THREE.Mesh(figG, figMat);
        fig.position.set(fx, 0.85, fz);
        scene.add(fig);
      }
      disposables.push(figMat, figG);
    }

    // --- curator plaques (TextSummary) on the front wall, left of the entry ---
    // clickable like the paintings: fly in and read the full note in the card
    summaries.slice(0, 4).forEach((s, i) => {
      const id = String(s.id);
      const tex = makePlaque(`Curator note ${i + 1}`, descOf(s) || s.label);
      const m = new THREE.MeshBasicMaterial({ map: tex });
      const panel = new THREE.Mesh(sharedQuad, m);
      panel.scale.set(1.7, 2.12, 1);
      panel.position.set(-8 - i * 4, 2.5, ROOM_D / 2 - 0.3);
      panel.rotation.y = Math.PI;
      panel.userData = { nodeId: id, baseScale: panel.scale.clone() };
      scene.add(panel);
      disposables.push(tex, m);
      exhibits.push(panel);
      paintingById.set(id, panel);
      worldPos.set(id, panel.position.clone());
      worldNormal.set(id, new THREE.Vector3(0, 0, -1));
    });

    // highlight lines for the selected exhibit (rebuilt per selection)
    let selLines: THREE.LineSegments | null = null;
    function showSelLinks(id: string | null) {
      if (selLines) {
        scene.remove(selLines);
        selLines.geometry.dispose();
        (selLines.material as THREE.Material).dispose();
        selLines = null;
      }
      if (!id) return;
      const pa = worldPos.get(id);
      if (!pa) return;
      const pts: number[] = [];
      for (const c of model.adjacency.get(id) ?? []) {
        const pb = worldPos.get(c.id);
        if (!pb) continue;
        pts.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
      }
      if (!pts.length) return;
      const lg = new THREE.BufferGeometry();
      lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const lm = new THREE.LineBasicMaterial({
        color: 0xb0242f,
        transparent: true,
        opacity: 0.8,
      });
      selLines = new THREE.LineSegments(lg, lm);
      scene.add(selLines);
    }

    // --- camera fly-to ---
    let goal: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
    const OVERVIEW = {
      pos: new THREE.Vector3(0, 6.5, ROOM_D / 2 - 3),
      target: new THREE.Vector3(0, 2, -8),
    };

    function flyTo(id: string) {
      const p = worldPos.get(id);
      const n = worldNormal.get(id);
      if (!p || !n) return;
      const dist = paintingById.get(id)?.userData.baseScale.x > 4 ? 7.5 : 4.6;
      goal = {
        pos: new THREE.Vector3().copy(p).addScaledVector(n, dist).setY(Math.max(2, p.y - 0.2)),
        target: p.clone(),
      };
    }

    function nodeToSelection(id: string): Selection | null {
      const n = model.nodeById.get(id);
      if (!n) return null;
      return {
        id,
        name: displayName(n),
        type: n.type,
        hall:
          n.type === "TextSummary"
            ? "curator"
            : SCAFFOLD_TYPES.has(n.type)
              ? "archive"
              : hallOf.get(id) ?? "unsorted",
        desc: descOf(n),
        deadline: deadlineOf(n),
        neighbors: (model.adjacency.get(id) ?? [])
          .filter((c) => worldPos.has(c.id))
          .slice(0, 10)
          .map((c) => ({
            id: c.id,
            name: displayName(model.nodeById.get(c.id)!),
            kind: c.kind,
            reason: c.reason,
          })),
      };
    }

    let selectedId: string | null = null;
    function applySelect(id: string | null) {
      if (selectedId) {
        const f = frameById.get(selectedId);
        if (f) (f.material as THREE.MeshStandardMaterial).color.set(0x2e2a24);
      }
      selectedId = id;
      showSelLinks(id);
      if (id) {
        const f = frameById.get(id);
        if (f) (f.material as THREE.MeshStandardMaterial).color.set(0xc9a227);
        flyTo(id);
        setSel(nodeToSelection(id));
      } else {
        setSel(null);
      }
    }
    apiRef.current = {
      select: applySelect,
      overview: () => {
        applySelect(null);
        goal = { pos: OVERVIEW.pos.clone(), target: OVERVIEW.target.clone() };
      },
    };

    // --- pointer: hover + click (drag-aware) ---
    const raycaster = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let hovered: THREE.Mesh | null = null;
    let downAt: { x: number; y: number } | null = null;

    function pick(ev: PointerEvent): THREE.Mesh | null {
      const rect = renderer.domElement.getBoundingClientRect();
      ptr.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ptr, camera);
      const hit = raycaster.intersectObjects(exhibits, false)[0];
      return (hit?.object as THREE.Mesh) ?? null;
    }

    const onMove = (ev: PointerEvent) => {
      const painting = pick(ev);
      if (painting !== hovered) {
        if (hovered) {
          hovered.scale.copy(hovered.userData.baseScale as THREE.Vector3);
        }
        hovered = painting;
        if (painting) {
          painting.scale
            .copy(painting.userData.baseScale as THREE.Vector3)
            .multiplyScalar(1.045);
        }
        renderer.domElement.style.cursor = painting ? "pointer" : "grab";
        setHover(
          painting
            ? displayName(model.nodeById.get(painting.userData.nodeId as string)!)
            : null,
        );
      }
    };
    const onDown = (ev: PointerEvent) => {
      downAt = { x: ev.clientX, y: ev.clientY };
    };
    const onUp = (ev: PointerEvent) => {
      if (!downAt) return;
      const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
      downAt = null;
      if (moved > 5) return; // it was a drag, not a click
      const painting = pick(ev);
      applySelect(painting ? (painting.userData.nodeId as string) : null);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    // --- animate ---
    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      const dt = Math.min(0.05, clock.getDelta());
      if (goal) {
        const k = 1 - Math.exp(-4 * dt);
        camera.position.lerp(goal.pos, k);
        controls.target.lerp(goal.target, k);
        if (camera.position.distanceTo(goal.pos) < 0.08) goal = null;
      }
      controls.update();
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
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      showSelLinks(null);
      for (const d of disposables) d.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      apiRef.current = null;
      setSel(null);
      setHover(null);
    };
  }, [nodes, edges, scope]);

  return (
    <div className={styles.canvasWrap}>
      <div ref={mountRef} className={styles.mount} />

      {/* scope toggle: meaningful content vs. full graph incl. scaffolding */}
      <div className={styles.scopeToggle}>
        <button
          className={scope === "content" ? styles.scopeActive : styles.scopeBtn}
          onClick={() => setScope("content")}
        >
          Content
        </button>
        <button
          className={scope === "all" ? styles.scopeActive : styles.scopeBtn}
          onClick={() => setScope("all")}
        >
          Everything
        </button>
      </div>

      {/* hover tooltip */}
      {hover && !sel && <div className={styles.hoverTip}>{hover}</div>}

      {/* help line */}
      <div className={styles.help}>
        drag to orbit · scroll to zoom · click a painting to fly in — the glowing
        ones need you now
      </div>

      {/* selection card */}
      {sel && (
        <aside className={styles.card}>
          <button className={styles.close} onClick={() => apiRef.current?.select(null)}>
            ×
          </button>
          <span
            className={styles.cardHall}
            style={{ color: HALL_COLORS[sel.hall] ?? "#9ca3af" }}
          >
            {sel.hall} hall · {sel.type}
          </span>
          <h2 className={styles.cardName}>{sel.name}</h2>
          {sel.deadline && (
            <span className={styles.deadline}>due {sel.deadline}</span>
          )}
          {sel.desc && <p className={styles.cardDesc}>{sel.desc}</p>}
          {sel.neighbors.length > 0 && (
            <>
              <h3 className={styles.crossRefTitle}>See also</h3>
              <ul className={styles.crossRefs}>
                {sel.neighbors.map((nb) => (
                  <li key={nb.id}>
                    <button
                      className={styles.crossRef}
                      onClick={() => apiRef.current?.select(nb.id)}
                    >
                      <strong>{nb.name}</strong>
                      <span>
                        {nb.kind === "structural" ? nb.reason : `shares: ${nb.reason}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button className={styles.overviewBtn} onClick={() => apiRef.current?.overview()}>
            ↩ Back to overview
          </button>
        </aside>
      )}
    </div>
  );
}
