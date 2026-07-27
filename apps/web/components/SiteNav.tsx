import Link from "next/link";
import styles from "./siteNav.module.css";

const SURFACES = [
  { href: "/top", label: "Register" },
  { href: "/map", label: "Map" },
  { href: "/game", label: "The Assessor's Game" },
  { href: "/sources", label: "Sources" },
] as const;

/**
 * The one header every surface uses. `current` marks the active
 * destination so a visitor always knows which part of the roll they are
 * standing in.
 */
export function SiteNav({ current }: { current?: string }) {
  return (
    <header className={styles.nav}>
      <Link className={styles.mark} href="/">
        pedaterre
      </Link>
      <nav aria-label="Sections">
        <ul className={styles.list}>
          {SURFACES.map((surface) => {
            const active = current === surface.href;
            return (
              <li key={surface.href}>
                <Link
                  className={active ? styles.linkActive : styles.link}
                  href={surface.href}
                  aria-current={active ? "page" : undefined}
                >
                  {surface.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
