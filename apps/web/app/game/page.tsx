import type { Metadata } from "next";
import { AssessorsGame } from "@/components/AssessorsGame";
import styles from "./page.module.css";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "The Assessor's Game · pedaterre",
  description:
    "Two NYC tax blocks. Select the one carrying the higher assessed market value on the final roll.",
};

export default function GamePage() {
  return (
    <main className={styles.page}>
      <header className="site-header">
        <a className="wordmark" href="/">
          pedaterre
        </a>
        <a className="header-cta" href="/top">
          OPEN THE REGISTER
        </a>
      </header>

      <section className={styles.heading} aria-labelledby="game-title">
        <p className="eyebrow">NYC FY2027 FINAL ASSESSMENT ROLL</p>
        <h1 id="game-title">THE ASSESSOR&apos;S GAME</h1>
        <p>
          Two blocks are entered without figures. Select the block carrying
          the higher assessed market value.
        </p>
      </section>

      <AssessorsGame />
    </main>
  );
}
