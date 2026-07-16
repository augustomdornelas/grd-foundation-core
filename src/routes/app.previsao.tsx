import { createFileRoute } from "@tanstack/react-router";
import { PrevisaoEntrada } from "@/components/comercial/PrevisaoEntrada";

export const Route = createFileRoute("/app/previsao")({
  component: PrevisaoEntrada,
});
