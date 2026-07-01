import Link from "next/link";
import { getGraph } from "../lib/api";
import MuseumView from "./MuseumView";
import styles from "./museum.module.css";

export const metadata = {
  title: "Museum — Cognee Load Theory",
};

export default async function MuseumPage() {
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
          </Link>
          <h1>Cognee Museum</h1>
        </div>
        <div className={styles.stats}>
          <span>
            <strong>{graph.nodes.length}</strong> exhibits
          </span>
        </div>
      </header>

      <MuseumView nodes={graph.nodes} edges={graph.edges} />
    </div>
  );
}
