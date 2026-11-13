export function StaticGlobe({ reason }: { reason: string }) {
  const dots = Array.from({ length: 80 }, (_, index) => {
    const turn = index * 2.399963;
    const radius = 18 + (index % 9) * 3.2;
    return {
      cx: 50 + Math.cos(turn) * radius * 0.42,
      cy: 50 + Math.sin(turn) * radius * 0.42,
    };
  });

  return (
    <figure className="static-globe" data-globe="static">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label="Illustrative network globe"
      >
        <circle cx="50" cy="50" r="34" />
        {dots.map((dot) => (
          <circle
            key={`${dot.cx}-${dot.cy}`}
            cx={dot.cx}
            cy={dot.cy}
            r="0.55"
          />
        ))}
      </svg>
      <figcaption>
        Illustrative activity. Not live transactions. {reason}
      </figcaption>
    </figure>
  );
}
