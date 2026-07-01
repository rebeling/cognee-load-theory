"use client";

// Museum of Mind — the walkable interface over the cognee graph
// (docs/the-mind-space.md). Halls = categories, each memory is an exhibit on
// a pedestal, lighting = urgency, orbit + click to fly in and read, selection
// card with clickable cross-refs, scope toggle (content vs. full graph).

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

// Fixed colors for halls we know from the data; palette for the rest.
const HALL_COLORS: Record<string, string> = {
  person: "#7dd3fc",
  task: "#fbbf24",
  event: "#f472b6",
  family: "#86efac",
  location: "#c4b5fd",
  unsorted: "#9ca3af",
  archive: "#64748b",
};
const PALETTE = ["#fda4af", "#a5b4fc", "#6ee7b7", "#fcd34d", "#f0abfc", "#7dd3fc"];
const SCAFFOLD_TYPES = new Set(["TextDocument", "DocumentChunk"]);

const deadlineOf = (n: GraphNode): string | null =>
  descOf(n).match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1] ?? null;

// ---------------------------------------------------------------------------
// Hall assignment. The live graph often lacks Entity → EntityType edges, so
// halls are inferred: type name in the label wins, then in the description,
// then two rounds of adopt-the-majority-hall-of-your-neighbors, else Unsorted.
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
// with the model's priority score and connection count. Drives the lighting.
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

// --- canvas texture helpers ------------------------------------------------
function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLabel(text: string): THREE.CanvasTexture {
  return canvasTexture(512, 128, (ctx) => {
    ctx.fillStyle = "rgba(10,11,15,0.85)";
    ctx.beginPath();
    ctx.roundRect(4, 20, 504, 88, 18);
    ctx.fill();
    ctx.fillStyle = "#e8eaf0";
    ctx.font = "500 44px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const t = text.length > 24 ? text.slice(0, 23) + "…" : text;
    ctx.fillText(t, 256, 66);
  });
}

function makeHallSign(name: string, count: number, hex: string): THREE.CanvasTexture {
  return canvasTexture(512, 160, (ctx) => {
    ctx.fillStyle = "rgba(10,11,15,0.92)";
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 152, 14);
    ctx.fill();
    ctx.strokeStyle = hex;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = "#f1f3f8";
    ctx.font = "bold 58px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(name.toUpperCase(), 256, 78);
    ctx.fillStyle = "#8a92a6";
    ctx.font = "30px Georgia, serif";
    ctx.fillText(`${count} ${count === 1 ? "exhibit" : "exhibits"}`, 256, 126);
  });
}

function makePlaque(title: string, body: string): THREE.CanvasTexture {
  return canvasTexture(512, 640, (ctx) => {
    ctx.fillStyle = "#101218";
    ctx.fillRect(0, 0, 512, 640);
    ctx.strokeStyle = "#3a3f4d";
    ctx.lineWidth = 3;
    ctx.strokeRect(14, 14, 484, 612);
    ctx.fillStyle = "#c8b273";
    ctx.font = "bold 30px Georgia, serif";
    ctx.fillText(title, 36, 62);
    ctx.fillStyle = "#c5ccd9";
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
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.35, "rgba(255,255,255,0.25)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
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

    const halls = hallNames
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

    // --- renderer / scene / camera ---
    let width = mount.clientWidth || 800;
    let height = mount.clientHeight || 600;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060a);
    scene.fog = new THREE.Fog(0x05060a, 60, 170);

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 600);
    camera.position.set(0, 30, 42);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.2, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 3;
    controls.maxDistance = 90;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;

    // --- lights ---
    scene.add(new THREE.AmbientLight(0x8899bb, 0.55));
    const moon = new THREE.DirectionalLight(0xbfd0ff, 0.75);
    moon.position.set(18, 30, 10);
    scene.add(moon);

    const disposables: { dispose(): void }[] = [];
    const exhibits: THREE.Mesh[] = [];
    const worldPos = new Map<string, THREE.Vector3>();
    const gemById = new Map<string, THREE.Mesh>();

    // --- night sky ---
    {
      const starGeo = new THREE.BufferGeometry();
      const pts: number[] = [];
      for (let i = 0; i < 700; i++) {
        const v = new THREE.Vector3()
          .randomDirection()
          .multiplyScalar(220 + Math.random() * 60);
        v.y = Math.abs(v.y) + 8;
        pts.push(v.x, v.y, v.z);
      }
      starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
      const starMat = new THREE.PointsMaterial({ color: 0xaabbdd, size: 0.7, sizeAttenuation: true });
      scene.add(new THREE.Points(starGeo, starMat));
      disposables.push(starGeo, starMat);
    }

    // --- ground ---
    {
      const g = new THREE.CircleGeometry(140, 48);
      const m = new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 1 });
      const ground = new THREE.Mesh(g, m);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.02;
      scene.add(ground);
      disposables.push(g, m);
    }

    const haloTex = makeHaloTexture();
    disposables.push(haloTex);

    // --- atrium: curator monolith with TextSummary wall plaques ---
    const ATRIUM_R = 9;
    {
      const g = new THREE.CircleGeometry(ATRIUM_R, 40);
      const m = new THREE.MeshStandardMaterial({ color: 0x171a22, roughness: 0.9 });
      const floor = new THREE.Mesh(g, m);
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);
      disposables.push(g, m);

      const monoG = new THREE.BoxGeometry(2.6, 3.4, 2.6);
      const monoM = new THREE.MeshStandardMaterial({ color: 0x1c202b, roughness: 0.6, metalness: 0.3 });
      const mono = new THREE.Mesh(monoG, monoM);
      mono.position.y = 1.7;
      scene.add(mono);
      disposables.push(monoG, monoM);

      const plaques = [
        { title: "Museum of Mind", body: "The graph is the memory. This space is the interface. Walk toward the light to see what needs you now." },
        ...summaries.map((s, i) => ({ title: `Curator note ${i + 1}`, body: descOf(s) || s.label })),
      ].slice(0, 4);
      const quad = new THREE.PlaneGeometry(2.2, 2.75);
      disposables.push(quad);
      plaques.forEach((p, i) => {
        const tex = makePlaque(p.title, p.body);
        const mat = new THREE.MeshBasicMaterial({ map: tex });
        const panel = new THREE.Mesh(quad, mat);
        const ang = (i / 4) * Math.PI * 2;
        panel.position.set(Math.sin(ang) * 1.32, 1.75, Math.cos(ang) * 1.32);
        panel.rotation.y = ang;
        scene.add(panel);
        disposables.push(tex, mat);
      });

      const pl = new THREE.PointLight(0xfff2cc, 1.1, 26, 1.8);
      pl.position.set(0, 5, 0);
      scene.add(pl);
    }

    // --- halls ---
    const sharedQuad = new THREE.PlaneGeometry(1, 1);
    const gemGeo = new THREE.IcosahedronGeometry(0.5, 0);
    const crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const colGeo = new THREE.CylinderGeometry(0.22, 0.28, 4.2, 10);
    const colMat = new THREE.MeshStandardMaterial({ color: 0x232733, roughness: 0.85 });
    disposables.push(sharedQuad, gemGeo, crateGeo, colGeo, colMat);

    const GOLDEN = Math.PI * (3 - Math.sqrt(5));

    halls.forEach((hall, hi) => {
      const ang = (hi / halls.length) * Math.PI * 2;
      const hallR = Math.max(4, 1.9 * Math.sqrt(hall.members.length) + 2.2);
      const dist = ATRIUM_R + hallR + 7;
      const cx = Math.sin(ang) * dist;
      const cz = Math.cos(ang) * dist;
      const color = new THREE.Color(hall.color);

      // tinted floor disc
      const fg = new THREE.CircleGeometry(hallR, 36);
      const fm = new THREE.MeshStandardMaterial({
        color: color.clone().multiplyScalar(0.14),
        roughness: 0.95,
      });
      const floor = new THREE.Mesh(fg, fm);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(cx, 0.01, cz);
      scene.add(floor);
      disposables.push(fg, fm);

      // perimeter columns, leaving a doorway toward the atrium
      const nCols = 9;
      for (let c = 0; c < nCols; c++) {
        const ca = (c / nCols) * Math.PI * 2;
        // doorway faces the atrium (direction -ang from hall center)
        const doorAng = Math.atan2(-cx, -cz);
        let diff = ca - doorAng;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) < 0.45) continue;
        const col = new THREE.Mesh(colGeo, colMat);
        col.position.set(cx + Math.sin(ca) * hallR, 2.1, cz + Math.cos(ca) * hallR);
        scene.add(col);
      }

      // hall sign floating above the doorway (sprite: always readable)
      const signTex = makeHallSign(hall.name, hall.members.length, hall.color);
      const signMat = new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false });
      const sign = new THREE.Sprite(signMat);
      sign.scale.set(4.4, 1.35, 1);
      const toAtrium = new THREE.Vector3(-cx, 0, -cz).normalize();
      sign.position.set(cx + toAtrium.x * hallR, 4.6, cz + toAtrium.z * hallR);
      scene.add(sign);
      disposables.push(signTex, signMat);

      // hall light
      const hl = new THREE.PointLight(color, 1.4, hallR * 3.6, 1.7);
      hl.position.set(cx, 4.5, cz);
      scene.add(hl);

      // exhibits on a sunflower spiral
      hall.members.forEach((n, i) => {
        const id = String(n.id);
        const r = 1.35 * Math.sqrt(i + 0.6);
        const a = i * GOLDEN + ang;
        const px = cx + Math.sin(a) * r;
        const pz = cz + Math.cos(a) * r;
        const heat = urgency.get(id) ?? 0.3;
        const pedH = 0.75 + heat * 1.1;

        const pedG = new THREE.CylinderGeometry(0.42, 0.52, pedH, 18);
        const pedM = new THREE.MeshStandardMaterial({ color: 0x272b36, roughness: 0.8 });
        const ped = new THREE.Mesh(pedG, pedM);
        ped.position.set(px, pedH / 2, pz);
        scene.add(ped);
        disposables.push(pedG, pedM);

        const isCrate = SCAFFOLD_TYPES.has(n.type);
        const mat = new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          // lighting = urgency: what needs you now glows, the rest sits in shadow
          emissiveIntensity: 0.12 + heat * 1.15,
          roughness: 0.3,
          metalness: 0.5,
          flatShading: true,
        });
        const gem = new THREE.Mesh(isCrate ? crateGeo : gemGeo, mat);
        gem.position.set(px, pedH + 0.55, pz);
        gem.userData = { nodeId: id, spin: 0.004 + heat * 0.012, baseEmissive: mat.emissiveIntensity };
        scene.add(gem);
        disposables.push(mat);
        exhibits.push(gem);
        gemById.set(id, gem);
        worldPos.set(id, gem.position.clone());

        // urgency halo
        const spriteMat = new THREE.SpriteMaterial({
          map: haloTex,
          color,
          transparent: true,
          opacity: 0.08 + heat * 0.55,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const halo = new THREE.Sprite(spriteMat);
        halo.scale.setScalar(1.6 + heat * 2.6);
        halo.position.copy(gem.position);
        scene.add(halo);
        disposables.push(spriteMat);

        // nameplate sprite
        const labelTex = makeLabel(displayName(n));
        const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthWrite: false });
        const label = new THREE.Sprite(labelMat);
        label.scale.set(2.6, 0.65, 1);
        label.position.set(px, pedH + 1.55, pz);
        scene.add(label);
        disposables.push(labelTex, labelMat);
      });
    });

    // --- threads: structural connections between placed exhibits ---
    {
      const pts: number[] = [];
      const seen = new Set<string>();
      for (const [idA, conns] of model.adjacency) {
        const pa = worldPos.get(idA);
        if (!pa) continue;
        for (const c of conns) {
          if (c.kind !== "structural") continue;
          const key = idA < c.id ? `${idA}|${c.id}` : `${c.id}|${idA}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const pb = worldPos.get(c.id);
          if (!pb) continue;
          pts.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
        }
      }
      if (pts.length) {
        const lg = new THREE.BufferGeometry();
        lg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
        const lm = new THREE.LineBasicMaterial({
          color: 0x8899ff,
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        scene.add(new THREE.LineSegments(lg, lm));
        disposables.push(lg, lm);
      }
    }

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
        color: 0xff6677,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      selLines = new THREE.LineSegments(lg, lm);
      scene.add(selLines);
    }

    // --- camera fly-to ---
    let goal: { pos: THREE.Vector3; target: THREE.Vector3 } | null = null;
    const OVERVIEW = { pos: new THREE.Vector3(0, 30, 42), target: new THREE.Vector3(0, 1.2, 0) };

    function flyTo(id: string) {
      const p = worldPos.get(id);
      if (!p) return;
      const dir = camera.position.clone().sub(p);
      dir.y = 0;
      if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
      dir.normalize().multiplyScalar(5.5);
      goal = {
        pos: new THREE.Vector3(p.x + dir.x, Math.max(2.6, p.y + 1.4), p.z + dir.z),
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
        hall: SCAFFOLD_TYPES.has(n.type) ? "archive" : hallOf.get(id) ?? "unsorted",
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

    let selectedGem: THREE.Mesh | null = null;
    function applySelect(id: string | null) {
      if (selectedGem) {
        const m = selectedGem.material as THREE.MeshStandardMaterial;
        m.emissiveIntensity = selectedGem.userData.baseEmissive as number;
        selectedGem.scale.setScalar(1);
        selectedGem = null;
      }
      showSelLinks(id);
      if (id) {
        const gem = gemById.get(id);
        if (gem) {
          selectedGem = gem;
          (gem.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.6;
          gem.scale.setScalar(1.3);
        }
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
      const gem = pick(ev);
      if (gem !== hovered) {
        if (hovered && hovered !== selectedGem) {
          (hovered.material as THREE.MeshStandardMaterial).emissiveIntensity =
            hovered.userData.baseEmissive as number;
        }
        hovered = gem;
        if (gem && gem !== selectedGem) {
          (gem.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2;
        }
        renderer.domElement.style.cursor = gem ? "pointer" : "grab";
        setHover(
          gem ? displayName(model.nodeById.get(gem.userData.nodeId as string)!) : null,
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
      const gem = pick(ev);
      applySelect(gem ? (gem.userData.nodeId as string) : null);
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
      for (const g of exhibits) g.rotation.y += g.userData.spin as number;
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
        drag to orbit · scroll to zoom · click an exhibit to fly in — the bright
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
