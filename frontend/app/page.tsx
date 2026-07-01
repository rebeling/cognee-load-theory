import Link from "next/link";
import styles from "./page.module.css";
import { getLoad, getMemory } from "./lib/api";

export default async function Home() {
  // Parallel fetch — both requests start immediately (see Next.js fetching-data guide).
  const [load, memory] = await Promise.all([getLoad(), getMemory()]);

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <header className={styles.header}>
          <h1>Cognee Load Theory</h1>
          <p className={styles.subtitle}>Memory store — live view</p>
          <Link href="/graph" className={styles.navLink}>
            View knowledge universe →
          </Link>
          <Link href="/museum" className={styles.navLink}>
            Walk the museum →
          </Link>
          <Link href="/museum-2" className={styles.navLink}>
            Enter the Museum of Mind →
          </Link>
          <Link href="/explore" className={styles.navLink}>
            Explore connections →
          </Link>
        </header>

        <section className={styles.scoreCard}>
          <span className={styles.scoreValue}>{load.score}</span>
          <span className={styles.scoreLabel}>{load.detail}</span>
        </section>

        <section>
          <h2 className={styles.sectionTitle}>
            Memory items <span className={styles.count}>{memory.length}</span>
          </h2>
          {memory.length === 0 ? (
            <p className={styles.empty}>No items stored yet.</p>
          ) : (
            <ul className={styles.list}>
              {memory.map((item) => (
                <li key={item.id} className={styles.item}>
                  <span className={styles.itemId}>#{item.id}</span>
                  <span className={styles.itemText}>{item.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
