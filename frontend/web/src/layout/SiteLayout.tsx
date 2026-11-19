import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigationType } from "react-router-dom";
import { SITE } from "../content/site";
import { DealTicker } from "../feed/DealTicker";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import "./layout.css";

/** One header and one footer around every page. */
export function SiteLayout() {
  useScrollOnNavigate();
  return (
    <>
      <a className="skip" href="#content">
        {SITE.skip}
      </a>
      <DealTicker />
      <SiteHeader />
      <main id="content">
        <Outlet />
      </main>
      <SiteFooter />
    </>
  );
}

/**
 * A link to a section scrolls to it (the stylesheet offsets for the sticky
 * header) and moves focus there. Any other new page starts at the top. Back
 * and forward are left to the browser, which remembers where you were.
 */
function useScrollOnNavigate() {
  const location = useLocation();
  const type = useNavigationType();
  const first = useRef(true);

  useEffect(() => {
    const opening = first.current;
    first.current = false;

    if (location.hash) {
      const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) {
        const still =
          opening || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
        target.focus({ preventScroll: true });
        return;
      }
    }
    if (!opening && type !== "POP") window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [location.key, location.hash, location.pathname, type]);
}
