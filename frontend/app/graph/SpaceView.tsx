"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { GraphNode } from "../lib/api";
import { archetypeFor, makePlanetTextures } from "./planetTextures";
import styles from "./graph.module.css";

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

function displayName(n: GraphNode): string {
  const m = n.label.match(/^([A-Za-z]+)_[0-9a-fA-F-]{8,}$/);
  return m ? m[1] : n.label;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Priority: pick the property with the most distinct values, normalize to [0,1]. ---
function priorityScores(nodes: GraphNode[], degree: number[]): number[] {
  const candidates = ["importance_weight", "topological_rank", "feedback_weight"];
  let best: number[] | null = null;
  let bestDistinct = 1;
  for (const f of candidates) {
    const vals = nodes.map((n) => Number(n.properties?.[f]));
    if (!vals.every((v) => Number.isFinite(v))) continue;
    const distinct = new Set(vals).size;
    if (distinct > bestDistinct) {
      bestDistinct = distinct;
      best = vals;
    }
  }
  // Fall back to connection degree if no property varies.
  const raw = best ?? degree.map((d) => d);
  const min = Math.min(...raw);
  const max = Math.max(...raw);
  if (max === min) return raw.map(() => 0.5);
  return raw.map((v) => (v - min) / (max - min));
}

type V3 = { x: number; y: number; z: number };

// 3D force layout; works with or without edges (no edges -> evenly spread cluster).
function layout3D(n: number, links: [number, number][], seed = 42): V3[] {
  const rand = mulberry32(seed);
  const pos: V3[] = Array.from({ length: n }, () => {
    const u = rand() * 2 - 1;
    const th = rand() * Math.PI * 2;
    const r = 200 * Math.cbrt(rand());
    const s = Math.sqrt(1 - u * u);
    return { x: r * s * Math.cos(th), y: r * s * Math.sin(th), z: r * u };
  });
  if (n <= 1) return pos;
  const k = 0.6 * Math.cbrt((800 * 800 * 800) / n);
  let t = 120;
  for (let it = 0; it < 320; it++) {
    const disp: V3[] = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let dz = pos[i].z - pos[j].z;
        const d = Math.hypot(dx, dy, dz) || 0.01;
        dx /= d;
        dy /= d;
        dz /= d;
        const f = (k * k) / d;
        disp[i].x += dx * f;
        disp[i].y += dy * f;
        disp[i].z += dz * f;
        disp[j].x -= dx * f;
        disp[j].y -= dy * f;
        disp[j].z -= dz * f;
      }
    }
    for (const [a, b] of links) {
      let dx = pos[a].x - pos[b].x;
      let dy = pos[a].y - pos[b].y;
      let dz = pos[a].z - pos[b].z;
      const d = Math.hypot(dx, dy, dz) || 0.01;
      dx /= d;
      dy /= d;
      dz /= d;
      const f = (d * d) / k;
      disp[a].x -= dx * f;
      disp[a].y -= dy * f;
      disp[a].z -= dz * f;
      disp[b].x += dx * f;
      disp[b].y += dy * f;
      disp[b].z += dz * f;
    }
    for (let i = 0; i < n; i++) {
      disp[i].x += -pos[i].x * 0.01;
      disp[i].y += -pos[i].y * 0.01;
      disp[i].z += -pos[i].z * 0.01;
      const dl = Math.hypot(disp[i].x, disp[i].y, disp[i].z) || 0.01;
      const lim = Math.min(dl, t) / dl;
      pos[i].x += disp[i].x * lim;
      pos[i].y += disp[i].y * lim;
      pos[i].z += disp[i].z * lim;
    }
    t = Math.max(t * 0.965, 1);
  }
  // center + scale to radius 55
  const c = pos.reduce(
    (a, p) => ({ x: a.x + p.x, y: a.y + p.y, z: a.z + p.z }),
    { x: 0, y: 0, z: 0 },
  );
  c.x /= n;
  c.y /= n;
  c.z /= n;
  let maxR = 0.01;
  for (const p of pos) {
    p.x -= c.x;
    p.y -= c.y;
    p.z -= c.z;
    maxR = Math.max(maxR, Math.hypot(p.x, p.y, p.z));
  }
  const sc = 55 / maxR;
  for (const p of pos) {
    p.x *= sc;
    p.y *= sc;
    p.z *= sc;
  }
  return pos;
}

export default function SpaceView({ nodes, edges }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // Bridge React selection into the running 3D scene.
  const selectedRef = useRef<number | null>(null);
  const refreshRef = useRef<((i: number) => void) | null>(null);
  const prevSelRef = useRef<number | null>(null);

  const presentTypes = useMemo(
    () => Array.from(new Set(nodes.map((n) => n.type))).sort(),
    [nodes],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const idIndex = new Map(nodes.map((nd, i) => [String(nd.id), i]));
    const links: [number, number][] = edges
      .map(
        (e) =>
          [idIndex.get(String(e.source)), idIndex.get(String(e.target))] as [
            number | undefined,
            number | undefined,
          ],
      )
      .filter((p): p is [number, number] => p[0] != null && p[1] != null);

    const degree = new Array(nodes.length).fill(0);
    for (const [a, b] of links) {
      degree[a]++;
      degree[b]++;
    }
    const scores = priorityScores(nodes, degree);
    const positions = layout3D(nodes.length, links);
    const rand = mulberry32(7);

    // --- Renderer / scene / camera ---
    let width = mount.clientWidth || 800;
    let height = mount.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(width, height);
    labelRenderer.domElement.style.position = "absolute";
    labelRenderer.domElement.style.top = "0";
    labelRenderer.domElement.style.left = "0";
    labelRenderer.domElement.style.pointerEvents = "none";
    mount.appendChild(labelRenderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 2000);
    camera.position.set(0, 28, 140);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.minDistance = 30;
    controls.maxDistance = 600;

    // --- Lights ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(60, 80, 40);
    scene.add(key);
    const rim = new THREE.PointLight(0x88aaff, 1.2, 1200);
    rim.position.set(-120, -40, -100);
    scene.add(rim);

    // --- Starfield ---
    const starGeo = new THREE.BufferGeometry();
    const STAR_COUNT = 2400;
    const starPos = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const u = rand() * 2 - 1;
      const th = rand() * Math.PI * 2;
      const r = 350 + rand() * 500;
      const s = Math.sqrt(1 - u * u);
      starPos[i * 3] = r * s * Math.cos(th);
      starPos[i * 3 + 1] = r * s * Math.sin(th);
      starPos[i * 3 + 2] = r * u;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // --- Planets ---
    const root = new THREE.Group();
    scene.add(root);

    const planets: THREE.Mesh[] = [];
    const halos: THREE.Mesh[] = [];
    const clouds: THREE.Mesh[] = [];
    const labels: HTMLDivElement[] = [];
    const disposables: { dispose(): void }[] = [];
    // Reuse textures across planets that share type-colour + archetype.
    const texCache = new Map<string, ReturnType<typeof makePlanetTextures>>();

    nodes.forEach((nd, i) => {
      const radius = 1.4 + scores[i] * 4.2; // PRIORITY -> SIZE
      const hex = colorFor(nd.type);
      // deterministic per-node seed
      const seed =
        Math.abs(
          String(nd.id)
            .split("")
            .reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) | 0, 7),
        ) % 100000;
      const archetype = archetypeFor(nd.type, seed);
      const baseCol = new THREE.Color(hex);

      const cacheKey = `${archetype}|${hex}|${seed % 6}`;
      let tex = texCache.get(cacheKey);
      if (!tex) {
        tex = makePlanetTextures(hex, archetype, seed);
        texCache.set(cacheKey, tex);
        disposables.push(tex.map, tex.bump);
        if (tex.clouds) disposables.push(tex.clouds);
        if (tex.emissive) disposables.push(tex.emissive);
      }

      const group = new THREE.Group();
      group.position.set(positions[i].x, positions[i].y, positions[i].z);

      const geo = new THREE.SphereGeometry(radius, 40, 40);
      const smooth = archetype === "gas" || archetype === "ice";
      const mat = new THREE.MeshStandardMaterial({
        map: tex.map,
        bumpMap: tex.bump,
        bumpScale: smooth ? 0.15 : 0.8,
        roughness: smooth ? 0.45 : 0.95,
        metalness: 0.04,
        emissive: tex.emissive ? new THREE.Color(0xffffff) : new THREE.Color(0x000000),
        emissiveMap: tex.emissive ?? null,
        emissiveIntensity: tex.emissive ? 1.3 : 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.index = i;
      mesh.rotation.y = rand() * Math.PI * 2;
      mesh.rotation.z = (rand() - 0.5) * 0.5; // slight axial tilt
      mesh.userData.spin = 0.0015 + rand() * 0.004;
      group.add(mesh);
      disposables.push(geo, mat);

      // cloud shell (terran)
      if (tex.clouds) {
        const cgeo = new THREE.SphereGeometry(radius * 1.03, 32, 32);
        const cmat = new THREE.MeshStandardMaterial({
          map: tex.clouds,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          roughness: 1,
        });
        const cloud = new THREE.Mesh(cgeo, cmat);
        cloud.userData.spin = 0.0009 + rand() * 0.0014;
        group.add(cloud);
        clouds.push(cloud);
        disposables.push(cgeo, cmat);
      }

      // thin atmosphere rim
      const glowGeo = new THREE.SphereGeometry(radius * 1.14, 24, 24);
      const glowMat = new THREE.MeshBasicMaterial({
        color: baseCol,
        transparent: true,
        opacity: 0.1,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      group.add(new THREE.Mesh(glowGeo, glowMat));
      disposables.push(glowGeo, glowMat);

      // selection/hover halo (hidden by default)
      const haloGeo = new THREE.SphereGeometry(radius * 1.5, 24, 24);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.18,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.visible = false;
      group.add(halo);
      halos.push(halo);
      disposables.push(haloGeo, haloMat);

      // Saturn-style ring for high-priority worlds
      if (scores[i] > 0.6) {
        const ringGeo = new THREE.RingGeometry(radius * 1.5, radius * 2.3, 64);
        const ringMat = new THREE.MeshBasicMaterial({
          color: baseCol,
          transparent: true,
          opacity: 0.4,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2 + (rand() - 0.5) * 0.6;
        ring.rotation.y = (rand() - 0.5) * 0.6;
        group.add(ring);
        disposables.push(ringGeo, ringMat);
      }

      const div = document.createElement("div");
      div.className = styles.planetLabel;
      div.textContent = displayName(nd);
      div.style.display = "none";
      const labelObj = new CSS2DObject(div);
      labelObj.position.set(0, radius + 1.6, 0);
      group.add(labelObj);
      labels.push(div);

      root.add(group);
      planets.push(mesh);
    });

    // Highlight a single planet based on current hover/selection state.
    const refresh = (i: number) => {
      if (i < 0 || i >= planets.length) return;
      const isH = i === hovered;
      const isS = i === selectedRef.current;
      planets[i].scale.setScalar(isH ? 1.22 : 1);
      halos[i].visible = isH || isS;
      (halos[i].material as THREE.MeshBasicMaterial).opacity = isS ? 0.32 : 0.16;
      labels[i].style.display = isH || isS ? "block" : "none";
    };
    refreshRef.current = refresh;

    // --- Edges (only when present) ---
    if (links.length) {
      const lg = new THREE.BufferGeometry();
      const lp = new Float32Array(links.length * 6);
      links.forEach(([a, b], i) => {
        lp[i * 6] = positions[a].x;
        lp[i * 6 + 1] = positions[a].y;
        lp[i * 6 + 2] = positions[a].z;
        lp[i * 6 + 3] = positions[b].x;
        lp[i * 6 + 4] = positions[b].y;
        lp[i * 6 + 5] = positions[b].z;
      });
      lg.setAttribute("position", new THREE.BufferAttribute(lp, 3));
      const lm = new THREE.LineBasicMaterial({
        color: 0x6688aa,
        transparent: true,
        opacity: 0.25,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      root.add(new THREE.LineSegments(lg, lm));
      disposables.push(lg, lm);
    }

    // --- Hover via raycaster ---
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hovered = -1;

    const setHover = (idx: number) => {
      if (idx === hovered) return;
      const prev = hovered;
      hovered = idx;
      refresh(prev);
      refresh(hovered);
      renderer.domElement.style.cursor = hovered >= 0 ? "pointer" : "grab";
    };

    const onMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(planets, false);
      setHover(hits.length ? (hits[0].object.userData.index as number) : -1);
    };
    const onClick = () => {
      if (hovered >= 0) setSelected(hovered);
    };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("click", onClick);

    // --- Animation ---
    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const dt = clock.getDelta();
      for (const p of planets) p.rotation.y += (p.userData.spin as number);
      for (const c of clouds) c.rotation.y += (c.userData.spin as number);
      stars.rotation.y += dt * 0.006;
      starMat.opacity = 0.7 + Math.sin(clock.elapsedTime * 1.5) * 0.12;
      controls.update();
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    // --- Resize ---
    const ro = new ResizeObserver(() => {
      width = mount.clientWidth || width;
      height = mount.clientHeight || height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      labelRenderer.setSize(width, height);
    });
    ro.observe(mount);

    // --- Cleanup ---
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      for (const d of disposables) d.dispose();
      starGeo.dispose();
      starMat.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      mount.removeChild(labelRenderer.domElement);
      refreshRef.current = null;
    };
  }, [nodes, edges]);

  // Sync React selection -> 3D highlight (separate effect so the scene isn't rebuilt).
  useEffect(() => {
    const prev = prevSelRef.current;
    selectedRef.current = selected;
    prevSelRef.current = selected;
    refreshRef.current?.(prev ?? -1);
    refreshRef.current?.(selected ?? -1);
  }, [selected]);

  const selectedNode = selected != null ? nodes[selected] : null;
  const selectedText =
    selectedNode && typeof selectedNode.properties?.text === "string"
      ? (selectedNode.properties.text as string)
      : null;

  return (
    <div className={styles.canvasWrap}>
      <div ref={mountRef} className={styles.spaceMount} />

      <div className={styles.legend}>
        {presentTypes.map((ty) => (
          <span key={ty} className={styles.legendItem}>
            <span className={styles.swatch} style={{ background: colorFor(ty) }} />
            {ty}
          </span>
        ))}
      </div>

      {selectedNode && (
        <aside className={styles.panel}>
          <button
            className={styles.panelClose}
            onClick={() => setSelected(null)}
            aria-label="Close"
          >
            ×
          </button>
          <span
            className={styles.panelType}
            style={{ color: colorFor(selectedNode.type) }}
          >
            {selectedNode.type}
          </span>
          <h3 className={styles.panelTitle}>{displayName(selectedNode)}</h3>
          {typeof selectedNode.properties?.description === "string" &&
            selectedNode.properties.description !== displayName(selectedNode) && (
              <p className={styles.panelText}>
                {selectedNode.properties.description as string}
              </p>
            )}
          {selectedText && (
            <p className={styles.panelText}>
              {selectedText.length > 500
                ? selectedText.slice(0, 500) + "…"
                : selectedText}
            </p>
          )}
          <code className={styles.panelId}>{String(selectedNode.id)}</code>
        </aside>
      )}

      <p className={styles.hint}>
        drag = orbit · scroll = zoom · hover a planet · click for details · size =
        priority
      </p>
    </div>
  );
}
