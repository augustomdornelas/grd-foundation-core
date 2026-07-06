export function GridMotif({ className = "", opacity = 0.12 }: { className?: string; opacity?: number }) {
  return (
    <svg
      aria-hidden
      className={`pointer-events-none ${className}`}
      width="240"
      height="240"
      viewBox="0 0 240 240"
      style={{ opacity }}
    >
      {Array.from({ length: 8 }).map((_, r) =>
        Array.from({ length: 8 }).map((__, c) => {
          const isOrange = (r + c) % 3 === 0;
          return (
            <rect
              key={`${r}-${c}`}
              x={c * 28 + 4}
              y={r * 28 + 4}
              width={20}
              height={20}
              rx={3}
              fill={isOrange ? "#F37032" : "#ffffff"}
            />
          );
        })
      )}
    </svg>
  );
}
