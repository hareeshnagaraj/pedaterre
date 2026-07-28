import styles from "./siteNav.module.css";

const SURFACES = [
  { href: "/top", label: "Register" },
  { href: "/club", label: "Club" },
  { href: "/map", label: "Map" },
  { href: "/game", label: "The Game" },
  { href: "/sources", label: "Sources" },
] as const;

/**
 * The one header every surface uses. `current` marks the active
 * destination so a visitor always knows which part of the roll they are
 * standing in. Uses the established site-header/wordmark classes so it
 * inherits the same treatment the pages already had.
 */
export function SiteNav({ current }: { current?: string }) {
  return (
    <header className="site-header">
      <a className="wordmark" href="/">
        pedaterre
      </a>
      <nav aria-label="Sections">
        <ul className={styles.list}>
          {SURFACES.map((surface) => {
            const active = current === surface.href;
            return (
              <li key={surface.href}>
                <a
                  className={active ? styles.linkActive : styles.link}
                  href={surface.href}
                  aria-current={active ? "page" : undefined}
                >
                  {surface.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
