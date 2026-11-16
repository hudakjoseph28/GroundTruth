import { useEffect, useRef, useState, type RefObject } from "react";

/** A ref to put on an element, and whether that element is on screen right now. */
export function useOnScreen<T extends Element>(): [RefObject<T | null>, boolean] {
  const node = useRef<T>(null);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    const target = node.current;
    if (!target) return;
    const watcher = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? false));
    watcher.observe(target);
    return () => watcher.disconnect();
  }, []);

  return [node, onScreen];
}
