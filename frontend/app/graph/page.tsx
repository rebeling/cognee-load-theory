import Link from "next/link";
import { getGraph } from "../lib/api";
import SpaceView from "./SpaceView";
import styles from "./graph.module.css";

export const metadata = {
  title: "Knowledge Graph — Cognee Load Theory",
};

export default async function GraphPage() {
  const graph = await getGraph();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.back}>
            ← Memory
          </Link>{" "}
          <Link href="/museum" className={styles.back}>
            Museum
          </Link>
          <h1>Cognee Universe</h1>
        </div>
        <div className={styles.stats}>
          <span>
            <strong>{graph.nodes.length}</strong> planets
          </span>
          <span>
            <strong>{graph.edges.length}</strong> links
          </span>
        </div>
      </header>

      <SpaceView nodes={graph.nodes} edges={graph.edges} />
    </div>
  );
}
