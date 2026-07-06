import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function CookieBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("grd-cookies")) setShow(true);
  }, []);
  if (!show) return null;
  const accept = () => { localStorage.setItem("grd-cookies", "1"); setShow(false); };
  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-3xl rounded-xl border bg-white p-4 shadow-2xl md:left-6 md:right-auto md:bottom-6">
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
        <p className="text-sm text-muted-foreground">
          Usamos cookies para melhorar sua experiência. Ao continuar, você concorda com nossa{" "}
          <a href="#" className="font-medium text-primary underline">Política de Privacidade</a>.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={accept}>Recusar</Button>
          <Button size="sm" className="bg-[#F37032] text-white hover:bg-[#ff8850]" onClick={accept}>Aceitar</Button>
        </div>
      </div>
    </div>
  );
}
