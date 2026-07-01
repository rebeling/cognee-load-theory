"use client";

import { useEffect, useMemo, useState } from "react";
import type { GraphNode } from "../lib/api";
import { buildModel, descOf, displayName } from "./graphModel";
import styles from "./explore.module.css";

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

const SKIP_PROPS = new Set([
  "text", "metadata", "relations", "version", "description", "source_task",
  "source_pipeline", "source_user", "external_metadata", "raw_data_location",
  "source_content_hash", "id", "label", "type",
]);

const MAX_ON_RING = 16;

export default function ConstellationView({ nodes, edges }: Props) {
  const model = useMemo(() => buildModel(nodes, edges), [nodes, edges]);

  const ordered = useMemo(
    () =>
      [...nodes].sort(
        (a, b) =>
          (model.scores.get(String(b.id)) ?? 0) -
          (model.scores.get(String(a.id)) ?? 0),
      ),
    [nodes, model],
  );

  const [focusId, setFocusId] = useState<string>(() => String(ordered[0]?.id));
  const [history, setHistory] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const focusNode = model.nodeById.get(focusId);

  const conns = useMemo(() => {
    const list = model.adjacency.get(focusId) ?? [];
    return list
      .map((c) => ({ conn: c, node: model.nodeById.get(c.id) }))
      .filter((x): x is { conn: (typeof list)[number]; node: GraphNode } => !!x.node);
  }, [focusId, model]);

  const ringConns = conns.slice(0, MAX_ON_RING);

  function focus(id: string) {
    if (id === focusId) return;
    setHistory((h) => [...h, focusId]);
    setFocusId(id);
  }
  function back() {
    setHistory((h) => {
      if (!h.length) return h;
      setFocusId(h[h.length - 1]);
      return h.slice(0, -1);
    });
  }
  function jumpTo(historyIndex: number) {
    setHistory((h) => {
      const target = h[historyIndex];
      if (target == null) return h;
      setFocusId(target);
      return h.slice(0, historyIndex);
    });
  }

  // keyboard: 1-9 -> neighbour, Backspace/ArrowLeft -> back
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "Backspace" || e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (/^[1-9]$/.test(e.key)) {
        const i = Number(e.key) - 1;
        if (ringConns[i]) focus(String(ringConns[i].node.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // radial layout
  const R = ringConns.length > 10 ? 265 : 225;
  const positions = ringConns.map((_, i) => {
    const a = -Math.PI / 2 + (i / ringConns.length) * Math.PI * 2;
    return { x: Math.cos(a) * R, y: Math.sin(a) * R };
  });

  const types = useMemo(
    () => Array.from(new Set(nodes.map((n) => n.type))).sort(),
    [nodes],
  );

  const listNodes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ordered.filter((n) => {
      if (hidden.has(n.type)) return false;
      if (!q) return true;
      return (
        displayName(n).toLowerCase().includes(q) ||
        descOf(n).toLowerCase().includes(q)
      );
    });
  }, [ordered, query, hidden]);

  function radiusFor(id: string, base: number) {
    return base + (model.scores.get(id) ?? 0) * base * 0.8;
  }

  if (!focusNode) return null;

  const structuralCount = conns.filter((c) => c.conn.kind === "structural").length;
  const relatedCount = conns.length - structuralCount;

  const focusProps = Object.entries(focusNode.properties || {}).filter(
    ([k, v]) =>
      !SKIP_PROPS.has(k) &&
      (typeof v === "string" || typeof v === "number" || typeof v === "boolean"),
  );
  const focusText =
    typeof focusNode.properties?.text === "string"
      ? (focusNode.properties.text as string)
      : "";

  return (
    <div className={styles.body}>
      {/* ---- left: search + index ---- */}
      <aside className={styles.sidebar}>
        <input
          className={styles.search}
          placeholder="Search nodes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.filters}>
          {types.map((t) => {
            const on = !hidden.has(t);
            return (
              <button
                key={t}
                className={`${styles.chip} ${on ? "" : styles.chipOff}`}
                style={on ? { borderColor: colorFor(t) } : undefined}
                onClick={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    next.has(t) ? next.delete(t) : next.add(t);
                    return next;
                  })
                }
              >
                <span className={styles.dot} style={{ background: colorFor(t) }} />
                {t}
              </button>
            );
          })}
        </div>
        <div className={styles.list}>
          {listNodes.map((n) => {
            const id = String(n.id);
            return (
              <button
                key={id}
                className={`${styles.listItem} ${id === focusId ? styles.listActive : ""}`}
                onClick={() => focus(id)}
              >
                <span className={styles.dot} style={{ background: colorFor(n.type) }} />
                <span className={styles.listName}>{displayName(n)}</span>
                <span className={styles.listCount}>
                  {(model.adjacency.get(id) ?? []).length}
                </span>
              </button>
            );
          })}
          {listNodes.length === 0 && <p className={styles.empty}>No matches.</p>}
        </div>
      </aside>

      {/* ---- center: constellation ---- */}
      <section className={styles.stage}>
        <div className={styles.trail}>
          <button
            className={styles.trailBtn}
            onClick={back}
            disabled={!history.length}
          >
            ← Back
          </button>
          {history.map((hid, i) => {
            const hn = model.nodeById.get(hid);
            return (
              <button key={i} className={styles.crumb} onClick={() => jumpTo(i)}>
                {hn ? displayName(hn) : "?"}
              </button>
            );
          })}
          <span className={styles.crumbCurrent}>{displayName(focusNode)}</span>
        </div>

        <svg className={styles.svg} viewBox="-500 -360 1000 720">
          <g key={focusId} className={styles.constellation}>
            {/* links */}
            {ringConns.map(({ conn }, i) => (
              <line
                key={i}
                x1={0}
                y1={0}
                x2={positions[i].x}
                y2={positions[i].y}
                stroke={conn.kind === "structural" ? "#64748b" : "#3f3f46"}
                strokeWidth={conn.kind === "structural" ? 2 : 1.3}
                strokeDasharray={conn.kind === "related" ? "5 6" : undefined}
              />
            ))}

            {/* neighbours */}
            {ringConns.map(({ conn, node }, i) => {
              const id = String(node.id);
              const r = radiusFor(id, 15);
              const p = positions[i];
              return (
                <g
                  key={id}
                  transform={`translate(${p.x} ${p.y})`}
                  className={styles.neighbour}
                  onClick={() => focus(id)}
                >
                  <circle
                    r={r}
                    fill={colorFor(node.type)}
                    stroke="#0a0a0a"
                    strokeWidth={1.5}
                  />
                  {i < 9 && (
                    <text className={styles.badge} textAnchor="middle" dy="0.35em">
                      {i + 1}
                    </text>
                  )}
                  <text
                    className={styles.nLabel}
                    textAnchor="middle"
                    y={r + 15}
                  >
                    {displayName(node).length > 22
                      ? displayName(node).slice(0, 21) + "…"
                      : displayName(node)}
                  </text>
                  {conn.reason && (
                    <text className={styles.reason} textAnchor="middle" y={r + 29}>
                      {conn.kind === "structural" ? conn.reason : `~ ${conn.reason}`}
                    </text>
                  )}
                </g>
              );
            })}

            {/* focus node */}
            <g className={styles.focus}>
              <circle
                r={radiusFor(focusId, 30)}
                fill={colorFor(focusNode.type)}
                stroke="#fff"
                strokeWidth={3}
              />
              <text className={styles.focusLabel} textAnchor="middle" dy="0.35em">
                {displayName(focusNode).length > 16
                  ? displayName(focusNode).slice(0, 15) + "…"
                  : displayName(focusNode)}
              </text>
            </g>
          </g>
        </svg>

        <div className={styles.stageFoot}>
          <span>
            <span className={styles.legLine} /> structural ({structuralCount})
          </span>
          <span>
            <span className={`${styles.legLine} ${styles.legDashed}`} /> related (
            {relatedCount})
          </span>
          <span className={styles.tip}>press 1–9 to hop · Backspace = back</span>
        </div>
      </section>

      {/* ---- right: details ---- */}
      <aside className={styles.detail}>
        <span className={styles.detType} style={{ color: colorFor(focusNode.type) }}>
          {focusNode.type}
        </span>
        <h2 className={styles.detTitle}>{displayName(focusNode)}</h2>
        {descOf(focusNode) && (
          <p className={styles.detDesc}>{descOf(focusNode)}</p>
        )}
        {focusText && focusText !== descOf(focusNode) && (
          <details className={styles.detBlock}>
            <summary>Full text</summary>
            <p className={styles.detText}>{focusText}</p>
          </details>
        )}
        {focusProps.length > 0 && (
          <div className={styles.props}>
            {focusProps.map(([k, v]) => (
              <div key={k} className={styles.propRow}>
                <span className={styles.propKey}>{k.replace(/_/g, " ")}</span>
                <span className={styles.propVal}>{String(v)}</span>
              </div>
            ))}
          </div>
        )}

        <h3 className={styles.connHead}>
          Connections <span>{conns.length}</span>
        </h3>
        <div className={styles.connList}>
          {conns.map(({ conn, node }) => (
            <button
              key={String(node.id)}
              className={styles.connItem}
              onClick={() => focus(String(node.id))}
            >
              <span className={styles.dot} style={{ background: colorFor(node.type) }} />
              <span className={styles.connName}>{displayName(node)}</span>
              <span
                className={`${styles.connKind} ${
                  conn.kind === "related" ? styles.connRelated : ""
                }`}
              >
                {conn.kind === "structural" ? conn.reason || "linked" : `~${conn.reason}`}
              </span>
            </button>
          ))}
          {conns.length === 0 && (
            <p className={styles.empty}>No connections for this node yet.</p>
          )}
        </div>
      </aside>
    </div>
  );
}
