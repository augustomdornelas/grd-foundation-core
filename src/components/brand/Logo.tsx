import logo from "@/assets/logo_grd.png";

type Props = { variant?: "light" | "dark"; className?: string; size?: number };

export function Logo({ variant = "dark", className = "", size = 44 }: Props) {
  const isLight = variant === "light";
  return (
    <div
      className={`inline-flex items-center ${isLight ? "rounded-lg bg-white px-2.5 py-1.5 shadow-sm" : ""} ${className}`}
    >
      <img
        src={logo}
        alt="Grupo GRD"
        style={{ height: size, width: "auto" }}
        className="block"
      />
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
    <svg width={size} height={size} viewBox="0 0 36 36" aria-label="Grupo GRD" role="img">
      {cells.map((c, i) => {
        const x = (i % 3) * 12;
        const y = Math.floor(i / 3) * 12;
        return <rect key={i} x={x} y={y} width={10} height={10} rx={2} fill={c} />;
      })}
    </svg>
  );
}
