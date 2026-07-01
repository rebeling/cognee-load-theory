// Builds a browsable connection model from Cognee nodes.
//  - structural links: real graph edges + any property whose value is another node id
//  - related links:    shared significant words across label / description / text
// The related layer keeps the graph explorable even when Cognify emitted no edges.

import type { GraphNode } from "../lib/api";

export type ConnKind = "structural" | "related";
export type Conn = { id: string; kind: ConnKind; reason: string; weight: number };

export type GraphModel = {
  nodeById: Map<string, GraphNode>;
  adjacency: Map<string, Conn[]>;
  scores: Map<string, number>; // priority 0..1
};

export function displayName(n: GraphNode): string {
  const m = n.label.match(/^([A-Za-z]+)_[0-9a-fA-F-]{8,}$/);
  return m ? m[1] : n.label;
}

export function descOf(n: GraphNode): string {
  const d = n.properties?.description;
  const t = n.properties?.text;
  if (typeof d === "string" && d && d !== displayName(n)) return d;
  if (typeof t === "string" && t) return t;
  return "";
}

const STOP = new Set([
  "the", "and", "for", "with", "from", "that", "this", "was", "were", "has",
  "had", "his", "her", "she", "him", "они", "der", "die", "das", "und", "für",
  "mit", "bei", "ein", "eine", "einer", "einem", "den", "des", "von", "zum",
  "zur", "auf", "aus", "ist", "sind", "war", "wird", "nicht", "auch", "als",
  // generic structural prefixes in this dataset
  "topic", "task", "event", "source", "channel", "cluster", "chat", "parent",
  "demo", "data", "item", "node", "text", "summary", "chunk", "document",
  "textsummary", "documentchunk", "textdocument", "entity", "entitytype",
]);

function tokenize(n: GraphNode): string[] {
  const raw = `${displayName(n)} ${descOf(n)}`.toLowerCase();
  const seen = new Set<string>();
  for (const w of raw.split(/[^a-z0-9äöüß]+/)) {
    if (w.length < 3) continue;
    if (STOP.has(w)) continue;
    if (/^\d+$/.test(w)) continue;
    seen.add(w);
  }
  return [...seen];
}

function priorityScores(nodes: GraphNode[]): Map<string, number> {
  const fields = ["importance_weight", "topological_rank", "feedback_weight"];
  let best: number[] | null = null;
  let bestDistinct = 1;
  for (const f of fields) {
    const vals = nodes.map((n) => Number(n.properties?.[f]));
    if (!vals.every((v) => Number.isFinite(v))) continue;
    const distinct = new Set(vals).size;
    if (distinct > bestDistinct) {
      bestDistinct = distinct;
      best = vals;
    }
  }
  const raw = best ?? nodes.map(() => 0.5);
  const min = Math.min(...raw);
  const max = Math.max(...raw);
  const out = new Map<string, number>();
  nodes.forEach((n, i) =>
    out.set(String(n.id), max === min ? 0.5 : (raw[i] - min) / (max - min)),
  );
  return out;
}

const MAX_RELATED_PER_NODE = 10;

export function buildModel(
  nodes: GraphNode[],
  edges: { source: number | string; target: number | string; label: string }[],
): GraphModel {
  const nodeById = new Map(nodes.map((n) => [String(n.id), n]));
  const adjacency = new Map<string, Conn[]>();
  nodes.forEach((n) => adjacency.set(String(n.id), []));

  const structuralPairs = new Set<string>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  const addStructural = (a: string, b: string, reason: string) => {
    if (a === b || !nodeById.has(a) || !nodeById.has(b)) return;
    const key = pairKey(a, b);
    if (structuralPairs.has(key)) return;
    structuralPairs.add(key);
    adjacency.get(a)!.push({ id: b, kind: "structural", reason, weight: 3 });
    adjacency.get(b)!.push({ id: a, kind: "structural", reason, weight: 3 });
  };

  // real edges
  for (const e of edges) {
    addStructural(String(e.source), String(e.target), e.label || "linked");
  }
  // id-referencing properties (document_id, source_chunk_id, …)
  for (const n of nodes) {
    const p = n.properties || {};
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === "string" && nodeById.has(v)) {
        addStructural(String(n.id), v, k.replace(/_/g, " "));
      }
    }
  }

  // related links via shared tokens
  const index = new Map<string, string[]>();
  const nodeTokens = new Map<string, string[]>();
  for (const n of nodes) {
    const toks = tokenize(n);
    nodeTokens.set(String(n.id), toks);
    for (const t of toks) {
      const arr = index.get(t) ?? [];
      arr.push(String(n.id));
      index.set(t, arr);
    }
  }

  for (const n of nodes) {
    const id = String(n.id);
    const shared = new Map<string, string[]>(); // otherId -> shared words
    for (const t of nodeTokens.get(id)!) {
      const holders = index.get(t)!;
      if (holders.length > 12) continue; // skip ubiquitous words
      for (const other of holders) {
        if (other === id) continue;
        if (structuralPairs.has(pairKey(id, other))) continue;
        const list = shared.get(other) ?? [];
        list.push(t);
        shared.set(other, list);
      }
    }
    const ranked = [...shared.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, MAX_RELATED_PER_NODE);
    for (const [other, words] of ranked) {
      // avoid duplicating if the reverse was already added as related
      const existing = adjacency.get(id)!;
      if (existing.some((c) => c.id === other)) continue;
      const reason = words.slice(0, 3).join(", ");
      adjacency.get(id)!.push({
        id: other,
        kind: "related",
        reason,
        weight: words.length,
      });
    }
  }

  // sort each node's connections: structural first, then by weight
  for (const [, list] of adjacency) {
    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "structural" ? -1 : 1;
      return b.weight - a.weight;
    });
  }

  return { nodeById, adjacency, scores: priorityScores(nodes) };
}
