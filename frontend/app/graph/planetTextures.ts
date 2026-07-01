// Procedural planet textures generated on a 2D canvas — no image assets.
// fBm value-noise that tiles seamlessly along the X (longitude) axis so the
// sphere has no visible seam. Returns equirectangular (2:1) canvas textures.

import * as THREE from "three";

export type Archetype =
  | "terran"
  | "gas"
  | "rocky"
  | "ice"
  | "desert"
  | "lava";

export type PlanetTextures = {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  clouds?: THREE.CanvasTexture;
  emissive?: THREE.CanvasTexture;
};

const TW = 256;
const TH = 128;

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hash(i: number, j: number, seed: number): number {
  let h = (i * 374761393 + j * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Value noise; X lattice wraps modulo freqX (seamless), Y is clamped (poles).
function vnoise(
  x: number,
  y: number,
  freqX: number,
  freqY: number,
  seed: number,
): number {
  const fx = x * freqX;
  const fy = y * freqY;
  const i0 = Math.floor(fx);
  const j0 = Math.floor(fy);
  const tx = fx - i0;
  const ty = fy - j0;
  const i0w = ((i0 % freqX) + freqX) % freqX;
  const i1w = (i0w + 1) % freqX;
  const j0c = Math.max(0, Math.min(freqY - 1, j0));
  const j1c = Math.min(freqY - 1, j0c + 1);
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(i0w, j0c, seed);
  const b = hash(i1w, j0c, seed);
  const c = hash(i0w, j1c, seed);
  const d = hash(i1w, j1c, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
}

function fbm(
  x: number,
  y: number,
  seed: number,
  baseX = 6,
  baseY = 4,
  octaves = 5,
): number {
  let amp = 1;
  let sum = 0;
  let norm = 0;
  let fx = baseX;
  let fy = baseY;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x, y, fx, fy, seed + o * 1311);
    norm += amp;
    amp *= 0.5;
    fx *= 2;
    fy *= 2;
  }
  return sum / norm;
}

function ridged(n: number): number {
  return 1 - Math.abs(2 * n - 1);
}

function makeCanvas(): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = TW;
  c.height = TH;
  const ctx = c.getContext("2d")!;
  return { c, ctx };
}

function toTexture(c: HTMLCanvasElement, srgb: boolean): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

export function makePlanetTextures(
  hex: string,
  archetype: Archetype,
  seed: number,
): PlanetTextures {
  const base = hexToRgb(hex);
  const white: RGB = [240, 244, 250];
  const { c: colorC, ctx: colorCtx } = makeCanvas();
  const { c: bumpC, ctx: bumpCtx } = makeCanvas();
  const colorImg = colorCtx.createImageData(TW, TH);
  const bumpImg = bumpCtx.createImageData(TW, TH);

  let emissiveImg: ImageData | null = null;
  let emissiveCtx: CanvasRenderingContext2D | null = null;
  let emissiveCanvas: HTMLCanvasElement | null = null;
  if (archetype === "lava") {
    const e = makeCanvas();
    emissiveCanvas = e.c;
    emissiveCtx = e.ctx;
    emissiveImg = emissiveCtx.createImageData(TW, TH);
  }

  for (let py = 0; py < TH; py++) {
    const v = py / TH;
    const polar = Math.max(smoothstep(0.16, 0.02, v), smoothstep(0.84, 0.98, v));
    for (let px = 0; px < TW; px++) {
      const u = px / TW;
      let col: RGB;
      let elev: number;

      switch (archetype) {
        case "terran": {
          const n = fbm(u, v, seed, 5, 3, 6);
          const sea = 0.5;
          if (n < sea) {
            const depth = smoothstep(sea, 0.2, n);
            col = mix(mix(base, [12, 38, 78], 0.7), [4, 16, 44], depth);
            elev = 0.35;
          } else {
            const land = smoothstep(sea, 0.85, n);
            const green = mix([46, 92, 52], [120, 104, 64], land);
            col = mix(green, base, 0.18);
            elev = 0.55 + land * 0.45;
          }
          if (polar > 0.4) {
            const ice = smoothstep(0.4, 0.95, polar) * (n > sea ? 1 : 0.6);
            col = mix(col, white, ice);
            elev = Math.max(elev, ice * 0.9);
          }
          break;
        }
        case "gas": {
          const swirl = fbm(u, v, seed, 3, 2, 4) * 0.18;
          const bands = Math.sin((v + swirl) * Math.PI * 11);
          const t = bands * 0.5 + 0.5;
          const dark = mix(base, [20, 20, 28], 0.55);
          const light = mix(base, [255, 255, 245], 0.35);
          col = mix(dark, light, t);
          // a turbulent storm spot
          const sdx = (u - 0.66) * 2.4;
          const sdy = (v - 0.58) * 4.0;
          const storm = smoothstep(1, 0, Math.hypot(sdx, sdy));
          col = mix(col, mix(base, [220, 120, 90], 0.6), storm * 0.7);
          elev = 0.5;
          break;
        }
        case "rocky": {
          const n = fbm(u, v, seed, 7, 5, 6);
          const craters = ridged(fbm(u, v, seed + 99, 9, 7, 4));
          const shade = n * 0.7 + 0.15;
          col = mix(mix(base, [70, 66, 60], 0.45), [150, 140, 130], shade);
          col = mix(col, [30, 26, 24], smoothstep(0.75, 1, craters) * 0.6);
          elev = shade * 0.7 + (1 - craters) * 0.3;
          break;
        }
        case "desert": {
          const n = fbm(u, v, seed, 4, 8, 5); // stretched dunes
          const dune = Math.sin((u * 6 + n * 3) * Math.PI) * 0.5 + 0.5;
          col = mix(mix(base, [196, 150, 96], 0.5), [120, 78, 44], dune * 0.6);
          elev = 0.4 + dune * 0.5;
          break;
        }
        case "ice": {
          const n = fbm(u, v, seed, 6, 5, 5);
          const cracks = smoothstep(0.78, 0.95, ridged(n));
          col = mix(mix(base, white, 0.6), [110, 150, 190], n * 0.4);
          col = mix(col, [40, 70, 110], cracks * 0.5);
          elev = 0.5 + n * 0.3 + cracks * 0.2;
          break;
        }
        case "lava":
        default: {
          const n = fbm(u, v, seed, 6, 5, 6);
          const flow = smoothstep(0.55, 0.78, n);
          col = mix([28, 18, 16], [70, 40, 34], n);
          const glow = smoothstep(0.62, 0.9, n);
          elev = 0.4 + n * 0.5;
          if (emissiveImg) {
            const e: RGB = mix([90, 18, 4], [255, 180, 60], smoothstep(0.6, 0.95, n));
            const eo = (py * TW + px) * 4;
            emissiveImg.data[eo] = e[0] * glow;
            emissiveImg.data[eo + 1] = e[1] * glow;
            emissiveImg.data[eo + 2] = e[2] * glow;
            emissiveImg.data[eo + 3] = 255;
          }
          col = mix(col, [255, 140, 40], flow * 0.25);
          break;
        }
      }

      const o = (py * TW + px) * 4;
      colorImg.data[o] = col[0];
      colorImg.data[o + 1] = col[1];
      colorImg.data[o + 2] = col[2];
      colorImg.data[o + 3] = 255;

      const b = Math.max(0, Math.min(255, elev * 255));
      bumpImg.data[o] = b;
      bumpImg.data[o + 1] = b;
      bumpImg.data[o + 2] = b;
      bumpImg.data[o + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);

  const out: PlanetTextures = {
    map: toTexture(colorC, true),
    bump: toTexture(bumpC, false),
  };

  if (emissiveImg && emissiveCtx && emissiveCanvas) {
    emissiveCtx.putImageData(emissiveImg, 0, 0);
    out.emissive = toTexture(emissiveCanvas, true);
  }

  // Cloud layer for terran worlds.
  if (archetype === "terran") {
    const { c: cc, ctx: cctx } = makeCanvas();
    const cimg = cctx.createImageData(TW, TH);
    for (let py = 0; py < TH; py++) {
      for (let px = 0; px < TW; px++) {
        const n = fbm(px / TW, py / TH, seed + 555, 5, 4, 5);
        const a = smoothstep(0.55, 0.8, n) * 255;
        const o = (py * TW + px) * 4;
        cimg.data[o] = 255;
        cimg.data[o + 1] = 255;
        cimg.data[o + 2] = 255;
        cimg.data[o + 3] = a;
      }
    }
    cctx.putImageData(cimg, 0, 0);
    out.clouds = toTexture(cc, true);
  }

  return out;
}

const POOLS: Record<string, Archetype[]> = {
  TextDocument: ["gas"],
  TextSummary: ["gas", "ice"],
  DocumentChunk: ["terran", "rocky"],
  Entity: ["terran", "rocky", "desert", "ice", "lava"],
  EntityType: ["ice", "rocky"],
};

export function archetypeFor(type: string, seed: number): Archetype {
  const pool = POOLS[type] ?? ["rocky"];
  return pool[seed % pool.length];
}
