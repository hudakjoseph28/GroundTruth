import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { DOCS, MENU, NAV, ROADMAP_LINK, SITE, WALKTHROUGH_LINK } from "../content/site";
import { BrandMark } from "./BrandMark";
import { NetworkChip } from "./NetworkChip";

/** About where the bar has room for its links again (see layout.css). */
const WIDE_QUERY = "(min-width: 64rem)";

/** A search field. With nothing typed, a click opens the search page. */
function HeaderSearch({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function go(event?: FormEvent) {
    event?.preventDefault();
    const next = query.trim();
    navigate(next ? `/search?q=${encodeURIComponent(next)}` : "/search");
    onNavigate?.();
  }

  return (
    <form className="header-search" role="search" aria-label="Search" onSubmit={go}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="4.6" />
        <path d="m10.5 10.5 3.4 3.4" />
      </svg>
      <input
        name="q"
        value={query}
        placeholder="Search Ohio"
        aria-label="Parcel ID or address"
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setQuery(event.target.value)}
        onPointerDown={() => {
          if (query.trim() === "") go();
        }}
      />
    </form>
  );
}

function ExternalIcon() {
  return (
    <svg className="external-icon" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M4.5 2.5h5v5M9.5 2.5 3 9" />
    </svg>
  );
}

/** The links, once for the bar and once for the phone menu. */
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV.map((item) => (
        <Link key={item.hash} to={{ pathname: "/", hash: `#${item.hash}` }} onClick={onNavigate}>
          {item.label}
        </Link>
      ))}
      <NavLink to={WALKTHROUGH_LINK.to} onClick={onNavigate}>
        {WALKTHROUGH_LINK.label}
      </NavLink>
      <NavLink to={ROADMAP_LINK.to} onClick={onNavigate}>
        {ROADMAP_LINK.label}
      </NavLink>
      <a href={DOCS.href} target="_blank" rel="noreferrer" onClick={onNavigate}>
        {DOCS.label}
        <ExternalIcon />
        <span className="visually-hidden">
          ({DOCS.note}, {SITE.newTab})
        </span>
      </a>
    </>
  );
}

/**
 * Slim and sticky. Clear over the top of the page, frosted once the page has
 * scrolled under it. On a narrow screen the links move into a full-height menu.
 */
export function SiteHeader() {
  const sentinel = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDialogElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // A marker at the very top of the page: once it has scrolled away, frost the bar.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const watcher = new IntersectionObserver(([entry]) => setScrolled(!entry?.isIntersecting));
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const openMenu = () => {
    menu.current?.showModal();
    closer.current?.focus();
    setMenuOpen(true);
  };
  const closeMenu = () => menu.current?.close();

  // The menu belongs to narrow screens: if the window grows, put it away.
  useEffect(() => {
    const wide = window.matchMedia(WIDE_QUERY);
    const onChange = () => {
      if (wide.matches) menu.current?.close();
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  return (
    <>
      <div ref={sentinel} className="scroll-sentinel" aria-hidden="true" />
      <header className="site-header" data-scrolled={scrolled}>
        <div className="site-header-inner">
          <Link className="brand" to="/" aria-label={SITE.home}>
            <BrandMark />
            <span>{SITE.name}</span>
          </Link>
          <nav className="site-nav" aria-label={MENU.navLabel}>
            <NavLinks />
          </nav>
          <div className="site-actions">
            <HeaderSearch />
            <NetworkChip />
            <button
              type="button"
              className="menu-button"
              aria-haspopup="dialog"
              aria-expanded={menuOpen}
              onClick={openMenu}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M3.5 6.5h13M3.5 10h13M3.5 13.5h13" />
              </svg>
              <span className="visually-hidden">{MENU.open}</span>
            </button>
          </div>
        </div>
      </header>

      {/* A modal dialog: the browser traps focus inside it and Esc closes it. */}
      <dialog
        ref={menu}
        className="site-menu"
        aria-label={MENU.title}
        onClose={() => setMenuOpen(false)}
      >
        <div className="site-menu-head">
          <Link className="brand" to="/" aria-label={SITE.home} onClick={closeMenu}>
            <BrandMark />
            <span>{SITE.name}</span>
          </Link>
          <button ref={closer} type="button" className="menu-close" onClick={closeMenu}>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
            <span className="visually-hidden">{MENU.close}</span>
          </button>
        </div>
        <nav className="site-menu-nav" aria-label={MENU.navLabel}>
          <NavLinks onNavigate={closeMenu} />
        </nav>
        <div className="site-menu-foot">
          <HeaderSearch onNavigate={closeMenu} />
          <NetworkChip />
        </div>
      </dialog>
    </>
  );
}
