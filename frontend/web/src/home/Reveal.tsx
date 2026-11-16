import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Fades its children in, one after another, the first time it scrolls into
 * view. The motion is in home.css; with reduced motion nothing is ever hidden.
 */
export function Reveal({ className, children }: { className?: string; children: ReactNode }) {
  const node = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const target = node.current;
    if (!target) return;
    const watcher = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShown(true);
        watcher.disconnect();
      },
      // A little way in, so the rise is seen rather than happening at the edge.
      { rootMargin: "0px 0px -10% 0px" },
    );
    watcher.observe(target);
    return () => watcher.disconnect();
  }, []);

  return (
    <div ref={node} className={className} data-reveal={shown ? "in" : "out"}>
      {children}
    </div>
  );
}
