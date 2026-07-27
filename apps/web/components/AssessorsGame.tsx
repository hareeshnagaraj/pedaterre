"use client";

import { useEffect, useRef, useState } from "react";
import { BlockViz } from "@/components/BlockViz";
import { NetworkErrorState } from "@/components/states";
import { StateFrame } from "@/components/states/StateFrame";
import stateStyles from "@/components/states/states.module.css";
import { blockRankRowsSchema, type BlockRankRow } from "@/lib/blockRanks";
import { boroughName } from "@/lib/borough";
import { fetchBlock } from "@/lib/data";
import {
  createGameRandom,
  gameBlockKey,
  isGamePayloadEligible,
  normalizeGameSeed,
  selectGamePair,
  type GameRandom,
} from "@/lib/game";
import type { BlockPayload } from "@/lib/schema";
import {
  composeGameCard,
  gameStamp,
} from "@/lib/share/composeCard";
import { copyLink, shareCard } from "@/lib/share/shareActions";
import { drawSkylineThumb } from "@/lib/share/thumbAdapter";
import styles from "./AssessorsGame.module.css";

type Side = "left" | "right";
type GamePhase = "loading" | "ready" | "revealed" | "ended" | "error";

interface LoadedBlock {
  rank: BlockRankRow;
  payload: BlockPayload;
}

interface LoadedPair {
  left: LoadedBlock;
  right: LoadedBlock;
}

interface PreparedPair {
  pair?: LoadedPair;
  error?: unknown;
}

class PairLoadError extends Error {
  constructor() {
    super("No further eligible pair could be loaded.");
    this.name = "PairLoadError";
  }
}

function mintSeed(): string {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0].toString(36);
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function loadPlayablePair({
  rows,
  streak,
  used,
  random,
  failureCount,
  signal,
}: {
  rows: readonly BlockRankRow[];
  streak: number;
  used: Set<string>;
  random: GameRandom;
  failureCount: { current: number };
  signal: AbortSignal;
}): Promise<LoadedPair> {
  while (!signal.aborted) {
    const selection = selectGamePair(rows, streak, used, random);
    if (!selection) throw new PairLoadError();

    used.add(gameBlockKey(selection.left));
    used.add(gameBlockKey(selection.right));

    try {
      const [left, right] = await Promise.all([
        fetchBlock(selection.left.b, selection.left.k, { signal }),
        fetchBlock(selection.right.b, selection.right.k, { signal }),
      ]);
      failureCount.current = 0;

      if (!isGamePayloadEligible(left) || !isGamePayloadEligible(right)) {
        continue;
      }
      return {
        left: { rank: selection.left, payload: left },
        right: { rank: selection.right, payload: right },
      };
    } catch (error) {
      if (signal.aborted || isAbort(error)) throw error;
      failureCount.current += 1;
      if (failureCount.current >= 2) throw error;
    }
  }

  throw signal.reason;
}

function formatRollValue(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function CountedValue({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(() =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ? value : 0,
  );

  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    if (motion.matches) {
      setDisplayed(value);
      return;
    }

    let frame = 0;
    let started = 0;
    const tick = (time: number) => {
      if (!started) started = time;
      const progress = Math.min(1, (time - started) / 420);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{formatRollValue(displayed)}</>;
}

function GameLoadingState() {
  const focusRef = useRef<HTMLHeadingElement>(null);

  return (
    <StateFrame
      busy
      eyebrow="ASSESSMENT EXERCISE"
      focusRef={focusRef}
      title="DEALING THE ROLL…"
    >
      <header className={stateStyles.requestHeader}>
        <p className={stateStyles.query}>
          <span className={stateStyles.queryLabel}>REGISTER STATUS</span>
          TWO ELIGIBLE BLOCKS
        </p>
      </header>
      <div className={stateStyles.silhouette} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <span className={stateStyles.tower} key={index} />
        ))}
      </div>
      <div className={stateStyles.actions}>
        <button className={stateStyles.button} type="button" disabled>
          PAIR PENDING
        </button>
      </div>
    </StateFrame>
  );
}

export function AssessorsGame({
  initialSeed,
}: {
  initialSeed?: string | null;
}) {
  const [seed, setSeed] = useState(
    () => normalizeGameSeed(initialSeed) ?? "",
  );
  const [phase, setPhase] = useState<GamePhase>("loading");
  const [pair, setPair] = useState<LoadedPair | null>(null);
  const [streak, setStreak] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const [shareWorking, setShareWorking] = useState(false);
  const [shareNotice, setShareNotice] = useState("");

  const rowsRef = useRef<BlockRankRow[]>([]);
  const usedRef = useRef(new Set<string>());
  const randomRef = useRef<GameRandom>(() => 0);
  const failureCountRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const prefetchedRef = useRef<Promise<PreparedPair> | null>(null);

  useEffect(() => {
    if (seed) {
      const url = new URL(window.location.href);
      if (url.searchParams.get("seed") !== seed) {
        url.searchParams.set("seed", seed);
        window.history.replaceState(null, "", url);
      }
      return;
    }

    const urlSeed = normalizeGameSeed(
      new URL(window.location.href).searchParams.get("seed"),
    );
    if (urlSeed) {
      setSeed(urlSeed);
      return;
    }

    const nextSeed = mintSeed();
    const url = new URL(window.location.href);
    url.searchParams.set("seed", nextSeed);
    window.history.replaceState(null, "", url);
    setSeed(nextSeed);
  }, [seed]);

  useEffect(() => {
    if (!seed) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    rowsRef.current = [];
    usedRef.current = new Set();
    randomRef.current = createGameRandom(seed);
    failureCountRef.current = 0;
    prefetchedRef.current = null;
    setPair(null);
    setStreak(0);
    setAnnouncement("");
    setPhase("loading");

    void (async () => {
      try {
        const response = await fetch("/data/block-ranks.json", {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`The city register returned HTTP ${response.status}.`);
        }
        const rows = blockRankRowsSchema.parse(await response.json());
        rowsRef.current = rows;
        const firstPair = await loadPlayablePair({
          rows,
          streak: 0,
          used: usedRef.current,
          random: randomRef.current,
          failureCount: failureCountRef,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setPair(firstPair);
        setPhase("ready");
      } catch (error) {
        if (!controller.signal.aborted && !isAbort(error)) setPhase("error");
      }
    })();

    return () => controller.abort();
  }, [retryVersion, seed]);

  const correctSide: Side | null = pair
    ? pair.left.payload.totalMv > pair.right.payload.totalMv
      ? "left"
      : "right"
    : null;
  const revealed = phase === "revealed" || phase === "ended";

  function choose(side: Side) {
    if (phase !== "ready" || !pair || !correctSide) return;

    const correct = side === correctSide;
    const nextStreak = correct ? streak + 1 : streak;
    setStreak(nextStreak);
    setPhase(correct ? "revealed" : "ended");
    setAnnouncement(
      `The roll says ${boroughName(pair.left.rank.b)} ${formatRollValue(
        pair.left.payload.totalMv,
      )} and ${boroughName(pair.right.rank.b)} ${formatRollValue(
        pair.right.payload.totalMv,
      )}. ${
        correct
          ? `Filing correct. Streak ${nextStreak}.`
          : `Filing incorrect. Run closed at ${streak}.`
      }`,
    );

    if (correct) {
      const controller = controllerRef.current;
      if (!controller) return;
      prefetchedRef.current = loadPlayablePair({
        rows: rowsRef.current,
        streak: nextStreak,
        used: usedRef.current,
        random: randomRef.current,
        failureCount: failureCountRef,
        signal: controller.signal,
      }).then(
        (nextPair) => ({ pair: nextPair }),
        (error: unknown) => ({ error }),
      );
    }
  }

  async function advance() {
    if (phase !== "revealed") return;
    setPhase("loading");
    const prepared = await prefetchedRef.current;
    prefetchedRef.current = null;
    if (!prepared || prepared.error || !prepared.pair) {
      if (!isAbort(prepared?.error)) setPhase("error");
      return;
    }
    setPair(prepared.pair);
    setAnnouncement("");
    setPhase("ready");
  }

  async function retry() {
    if (!rowsRef.current.length) {
      setRetryVersion((version) => version + 1);
      return;
    }

    const controller = controllerRef.current;
    if (!controller) return;
    failureCountRef.current = 0;
    setPhase("loading");
    try {
      const nextPair = await loadPlayablePair({
        rows: rowsRef.current,
        streak,
        used: usedRef.current,
        random: randomRef.current,
        failureCount: failureCountRef,
        signal: controller.signal,
      });
      setPair(nextPair);
      setAnnouncement("");
      setPhase("ready");
    } catch (error) {
      if (!isAbort(error)) setPhase("error");
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (phase === "ready" && event.key === "ArrowLeft") {
        event.preventDefault();
        choose("left");
      } else if (phase === "ready" && event.key === "ArrowRight") {
        event.preventDefault();
        choose("right");
      } else if (
        phase === "revealed" &&
        event.key === "Enter" &&
        !(event.target instanceof Element && event.target.closest("a, button"))
      ) {
        event.preventDefault();
        void advance();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const sameRunPath = `/game?seed=${encodeURIComponent(seed)}`;

  async function exportRunCard() {
    if (!pair) return;
    setShareWorking(true);
    setShareNotice("");
    try {
      const canvas = await composeGameCard(
        {
          left: pair.left.payload,
          right: pair.right.payload,
          seed,
          streak,
        },
        drawSkylineThumb,
      );
      const result = await shareCard({ png: canvas, stamp: gameStamp(seed) });
      setShareNotice(
        result.message ??
          (result.method === "download" ? "Image downloaded." : "Card shared."),
      );
    } catch (error) {
      if (isAbort(error)) return;
      setShareNotice("IMAGE DESK UNAVAILABLE — try again.");
    } finally {
      setShareWorking(false);
    }
  }

  async function copySameRunLink() {
    setShareNotice("");
    try {
      const result = await copyLink(
        new URL(sameRunPath, window.location.href).href,
      );
      setShareNotice(result.message ?? "Link copied.");
    } catch {
      setShareNotice("LINK DESK UNAVAILABLE — copy the address bar.");
    }
  }

  if (phase === "error") {
    return (
      <NetworkErrorState
        context={`GAME RUN · SEED ${seed} · STREAK ${streak}`}
        onRetry={() => void retry()}
      />
    );
  }

  if (phase === "loading" || !pair) return <GameLoadingState />;

  return (
    <section className={styles.game} aria-labelledby="game-pair-title">
      <div className={styles.registerLine}>
        <div>
          <span>CURRENT STREAK</span>
          <strong data-testid="game-streak">{streak}</strong>
        </div>
        <p>
          RUN SEED <strong>{seed}</strong>
        </p>
      </div>

      <p className={styles.instruction} id="game-pair-title">
        Which block does the roll value higher? Select one filing. Values
        remain withheld until submission.
      </p>

      <div className={styles.pair}>
        {(["left", "right"] as const).map((side) => {
          const block = pair[side];
          const name = boroughName(block.rank.b) ?? block.payload.borough;
          const correct = revealed && side === correctSide;
          const wrong = revealed && side !== correctSide;
          const className = [
            styles.choice,
            correct ? styles.correct : "",
            wrong ? styles.wrong : "",
          ]
            .filter(Boolean)
            .join(" ");
          const content = (
            <>
              <div className={styles.borough}>{name}</div>
              <div className={styles.choiceViz}>
                <BlockViz blind payload={block.payload} />
              </div>
              {!revealed ? (
                <span className={styles.chooseCta} aria-hidden="true">
                  THIS ONE
                </span>
              ) : null}
              {revealed ? (
                <div className={styles.reveal}>
                  <span>THE ROLL SAYS</span>
                  <strong>
                    <CountedValue value={block.payload.totalMv} />
                  </strong>
                  <small>OPEN THE BLOCK FILE</small>
                </div>
              ) : null}
            </>
          );

          return revealed ? (
            <a
              aria-label={`Open ${name} block file`}
              className={className}
              href={`/b/${block.rank.b}/${block.rank.k}`}
              key={side}
            >
              {content}
            </a>
          ) : (
            <button
              aria-label={`${side === "left" ? "Left" : "Right"} block, ${name}`}
              className={className}
              key={side}
              onClick={() => choose(side)}
              type="button"
            >
              {content}
            </button>
          );
        })}
      </div>

      <p className={styles.srOnly} aria-live="polite" role="status">
        {announcement}
      </p>

      {phase === "revealed" ? (
        <div className={styles.nextDesk}>
          <p>FILING ACCEPTED · STREAK {streak}</p>
          <button type="button" onClick={() => void advance()}>
            NEXT PAIR
          </button>
        </div>
      ) : null}

      {phase === "ended" ? (
        <section className={styles.runEnd} aria-labelledby="run-end-title">
          <div className={styles.runReceipt}>
            <p className={styles.runWordmark}>THE ASSESSOR&apos;S GAME</p>
            <p>STREAK ON FILE</p>
            <strong id="run-end-title">{streak}</strong>
            <span>{gameStamp(seed)}</span>
          </div>
          <div className={styles.runActions}>
            <p className="eyebrow">RUN CLOSED</p>
            <h2>THE ROLL HAS BEEN ENTERED.</h2>
            <button
              disabled={shareWorking}
              onClick={() => void exportRunCard()}
              type="button"
            >
              {shareWorking ? "DRAWING CARD…" : "SHARE RUN CARD"}
            </button>
            <button onClick={() => void copySameRunLink()} type="button">
              COPY SAME RUN LINK
            </button>
            <a href={sameRunPath}>PLAY THE SAME RUN</a>
            <p className={styles.shareNotice} aria-live="polite" role="status">
              {shareNotice}
            </p>
          </div>
        </section>
      ) : null}
    </section>
  );
}
