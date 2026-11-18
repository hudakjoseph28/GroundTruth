import { useEffect } from "react";
import { SITE } from "../content/site";

/** Names the browser tab after the page, and puts the site's name back on leaving. */
export function usePageTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;
    document.title = `${title} · ${SITE.name}`;
    return () => {
      document.title = SITE.name;
    };
  }, [title]);
}
