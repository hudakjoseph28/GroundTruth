import { useEffect, useId, useRef, type RefObject } from "react";
import type { Parcel } from "@groundtruth/shared";
import { EXPLORE } from "../../content/parcel";
import { googleEarthUrl, googleMapsSatelliteUrl } from "./links";

function ExternalIcon() {
  return (
    <svg className="explore-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.5 3.5h-3v9h9v-3M9.5 3.5h3v3M12.5 3.5 7.5 8.5" />
    </svg>
  );
}

/**
 * "Explore the area": a button that discloses links to the parcel's real
 * surroundings. A disclosure, not an ARIA menu: these are plain links, and
 * Tab moves through them like any others.
 */
export function ExploreMenu({
  centroid,
  open,
  button,
  onToggle,
  onClose,
  onOpenArea,
}: {
  centroid: Parcel["centroid"];
  open: boolean;
  button: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
  /** `refocus` is true when focus should go back to whatever opened the menu. */
  onClose: (refocus: boolean) => void;
  /** Present only when the in-app 3D view is available. */
  onOpenArea?: () => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  // Opening moves focus to the first choice.
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>("a, button")?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose(true);
      }
    };
    // A press anywhere else closes it. The land block handles its own presses.
    const onPress = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || root.current?.contains(target) || target.closest("[data-land-stage]")) return;
      onClose(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPress);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPress);
    };
  }, [open, onClose]);

  const links = [
    { ...EXPLORE.maps, href: googleMapsSatelliteUrl(centroid) },
    { ...EXPLORE.earth, href: googleEarthUrl(centroid) },
  ];

  return (
    <div className="explore" ref={root}>
      <button
        ref={button}
        type="button"
        className="explore-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        {EXPLORE.button}
        <svg className="explore-caret" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      <ul id={id} ref={list} className="explore-menu" hidden={!open}>
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href} target="_blank" rel="noopener noreferrer" onClick={() => onClose(false)}>
              <span className="explore-title">
                {link.title}
                <ExternalIcon />
              </span>
              <span className="explore-note">{link.note}</span>
              <span className="visually-hidden">({EXPLORE.newTab})</span>
            </a>
          </li>
        ))}
        {onOpenArea && (
          <li>
            <button type="button" onClick={onOpenArea}>
              <span className="explore-title">{EXPLORE.area.title}</span>
              <span className="explore-note">{EXPLORE.area.note}</span>
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
