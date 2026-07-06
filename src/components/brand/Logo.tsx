type Props = { variant?: "light" | "dark"; className?: string; showText?: boolean; size?: number };

export function Logo({ variant = "dark", className = "", showText = false, size = 40 }: Props) {
  const textColor = variant === "light" ? "#ffffff" : "#213368";
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMark size={size} />
      {showText && (
        <div className="leading-none" style={{ color: textColor }}>
          <div className="text-lg font-extrabold tracking-tight">GRUPO GRD</div>
          <div className="text-[10px] font-semibold tracking-[0.2em] opacity-80">BRASIL</div>
        </div>
      )}
    </div>
  );
}

export function LogoMark({ size = 40 }: { size?: number }) {
  const cells = [
    "#F37032", "#213368", "#F37032",
    "#213368", "#F37032", "#213368",
    "#F37032", "#213368", "#F37032",
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-label="Grupo GRD Brasil" role="img">
      {cells.map((c, i) => {
        const x = (i % 3) * 12;
        const y = Math.floor(i / 3) * 12;
        return <rect key={i} x={x} y={y} width={10} height={10} rx={2} fill={c} />;
      })}
    </svg>
  );
}
