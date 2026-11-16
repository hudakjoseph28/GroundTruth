import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DEMO, DOCS, MENU, NAV, SITE } from "../content/site";
import { sampleParcelPath } from "../data/parcelSource";
import { readDevnetSlot } from "../parcel/BlockTransition/devnetSlot";
import { BrandMark } from "./BrandMark";
import { NetworkChip } from "./NetworkChip";

// The parcel transition shows real devnet slots; asking as the visitor reaches
// for the demo gives the answer a head start.
const warmSlot = () => void readDevnetSlot();

/** About where the bar has room for its links again (see layout.css). */
const WIDE_QUERY = "(min-width: 60rem)";

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
            <NetworkChip />
            <Link
              className="btn btn-primary btn-small site-demo"
              to={sampleParcelPath()}
              onPointerDown={warmSlot}
              onFocus={warmSlot}
            >
              {DEMO.label}
            </Link>
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
          <NetworkChip />
          <Link
            className="btn btn-primary"
            to={sampleParcelPath()}
            onPointerDown={warmSlot}
            onClick={closeMenu}
          >
            {DEMO.label}
          </Link>
        </div>
      </dialog>
    </>
  );
}
