import { createContext, useContext, type ReactNode } from "react";
import { EXAMPLE } from "../content/example";
import "./example.css";

/**
 * True inside an example page. Components that would link a receipt to
 * Solana Explorer, read devnet, or offer a wallet action check it and show an
 * example in place of the real thing.
 */
const ExampleContext = createContext(false);

export function ExampleProvider({ children }: { children: ReactNode }) {
  return <ExampleContext.Provider value={true}>{children}</ExampleContext.Provider>;
}

export function useIsExample(): boolean {
  return useContext(ExampleContext);
}

/** The small tag every example page carries: "Example parcel · Illustrative data". */
export function ExampleTag({
  kind,
  className,
}: {
  kind: keyof Pick<typeof EXAMPLE.tag, "parcel" | "deal" | "walkthrough">;
  className?: string;
}) {
  return (
    <p className={className ? `example-tag ${className}` : "example-tag"} title={EXAMPLE.tag.title}>
      <span className="example-tag-mark" aria-hidden="true" />
      <strong>{EXAMPLE.tag[kind]}</strong>
      <span aria-hidden="true">·</span>
      <span>{EXAMPLE.tag.data}</span>
    </p>
  );
}
