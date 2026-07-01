import Link from "next/link";
import { getGraph } from "../lib/api";
import ConstellationView from "./ConstellationView";
import styles from "./explore.module.css";

export const metadata = {
  title: "Explore — Cognee Load Theory",
};

export default async function ExplorePage() {
  const graph = await getGraph();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/" className={styles.back}>
            ← Memory
          </Link>{" "}
          <Link href="/graph" className={styles.back}>
            Universe
          </Link>{" "}
          <Link href="/museum" className={styles.back}>
            Museum
          </Link>
          <h1>Cognee Explorer</h1>
        </div>
        <div className={styles.stats}>
          <span>
            <strong>{graph.nodes.length}</strong> nodes · focus one, follow its
            connections
          </span>
        </div>
      </header>

      <ConstellationView nodes={graph.nodes} edges={graph.edges} />
    </div>
  );
}
