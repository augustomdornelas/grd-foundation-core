import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function ResumoCard({
  icon,
  label,
  valor,
  sub,
  destaque,
}: {
  icon: ReactNode;
  label: string;
  valor: number;
  sub?: string;
  destaque?: boolean;
}) {
  return (
    <Card className={`flex items-center gap-3 p-4 ${destaque ? "border-[#F37032]" : ""}`}>
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg ${destaque ? "bg-[#F37032]/15 text-[#F37032]" : "bg-[#213368]/10 text-[#213368]"}`}
      >
        {icon}
      </div>
      <div>
        <div className="text-2xl font-extrabold text-[#213368]">{valor}</div>
        <div className="text-xs text-muted-foreground">
          {label}
          {sub ? ` · ${sub}` : ""}
        </div>
      </div>
    </Card>
  );
}
