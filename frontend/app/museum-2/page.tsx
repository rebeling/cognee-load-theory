import Link from "next/link";
import { getGraph } from "../lib/api";
import MindSpaceView from "./MindSpaceView";
import styles from "./museum2.module.css";

export const metadata = {
  title: "Mind Space — Cognee Load Theory",
};

// Museum of Mind (docs/the-mind-space.md): halls = categories, exhibits on
// pedestals, lighting = urgency, orbit + click, scope toggle. The graph is
// the memory; this space is the interface.
export default async function MindSpacePage() {
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
            Museum I
          </Link>
          <h1>Museum of Mind</h1>
        </div>
        <div className={styles.stats}>
          <span>
            <strong>{graph.nodes.length}</strong> memories carried
          </span>
        </div>
      </header>

      <MindSpaceView nodes={graph.nodes} edges={graph.edges} />
    </div>
  );
}
