import { useMemo } from "react";
import { encode } from "uqr";

/** A QR code for a URL, drawn as one SVG path: black on white, with its quiet zone. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const code = encode(value, { ecc: "M", border: 3 });
    let d = "";
    for (let row = 0; row < code.size; row++) {
      for (let col = 0; col < code.size; col++) {
        if (!code.data[row]?.[col]) continue;
        // One rectangle per run of dark modules in the row.
        let end = col;
        while (end + 1 < code.size && code.data[row]?.[end + 1]) end++;
        d += `M${col},${row}h${end - col + 1}v1h-${end - col + 1}z`;
        col = end;
      }
    }
    return { size: code.size, path: d };
  }, [value]);

  return (
    <svg
      className="qr"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
