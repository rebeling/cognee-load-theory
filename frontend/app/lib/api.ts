// Thin typed client for the backend JSON API.
// All business logic lives in `backend/`; the frontend only fetches + renders.

const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";

export type MemoryItem = {
  id: number | string;
  text: string;
};

export type LoadScore = {
  score: number;
  detail: string;
};

export type GraphNode = {
  id: number | string;
  label: string;
  type: string;
  properties: Record<string, unknown>;
};

export type GraphEdge = {
  source: number | string;
  target: number | string;
  label: string;
};

export type GraphResponse = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    // Runtime data — always read fresh, never cache at build time.
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`API ${path} -> ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function getMemory(): Promise<MemoryItem[]> {
  return getJSON<MemoryItem[]>("/api/memory");
}

export function getLoad(): Promise<LoadScore> {
  return getJSON<LoadScore>("/api/load");
}

export function getGraph(): Promise<GraphResponse> {
  return getJSON<GraphResponse>("/api/cognee-graph");
}
