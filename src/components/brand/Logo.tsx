import logoLight from "@/assets/logo_grd.png";
import logoDarkBg from "@/assets/logo_grd_dark.png.asset.json";

type Props = { variant?: "light" | "dark"; className?: string; size?: number };

export function Logo({ variant = "dark", className = "", size = 64 }: Props) {
  const isOnDarkBg = variant === "light";
  const src = isOnDarkBg ? logoDarkBg.url : logoLight;
  return (
    <div className={`inline-flex items-center ${className}`}>
      <img
        src={src}
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
