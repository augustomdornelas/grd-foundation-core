// /app/epis — sem aba escolhida, cai em Entregas, que é onde o
// almoxarifado trabalha no dia a dia. O replace evita que o índice
// entre no histórico e prenda o botão voltar num pingue-pongue.
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/epis/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/epis/entregas", replace: true });
  },
});
