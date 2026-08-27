// ============================================================
// Contador de dias parado, com o semáforo
// ------------------------------------------------------------
// Regra 15: toda candidatura em etapa não-final mostra há quantos dias
// está parada. Até o SLA da etapa, neutro; até o dobro, amarelo; acima
// do dobro, vermelho.
//
// O valor vem calculado de vw_rh_funil. Este componente só pinta.
// ============================================================
import { SEMAFORO_ESTILO, rotuloDias, type Semaforo } from "@/lib/rh-regras";

export function SemaforoEtapa({
  dias,
  semaforo,
  slaDias,
  compacto = false,
}: {
  dias: number;
  semaforo: Semaforo;
  slaDias?: number;
  compacto?: boolean;
}) {
  const estilo = SEMAFORO_ESTILO[semaforo];
  const titulo =
    slaDias && slaDias > 0
      ? `${estilo.titulo} — prazo desta etapa: ${rotuloDias(slaDias)}`
      : estilo.titulo;

  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${estilo.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${estilo.ponto}`} />
      {compacto ? `${dias}d` : rotuloDias(dias)}
    </span>
  );
}

/** Só o ponto colorido, para caber em linha de tabela apertada. */
export function PontoSemaforo({ semaforo, titulo }: { semaforo: Semaforo; titulo?: string }) {
  const estilo = SEMAFORO_ESTILO[semaforo];
  return (
    <span
      title={titulo ?? estilo.titulo}
      className={`inline-block h-2 w-2 rounded-full ${estilo.ponto}`}
    />
  );
}
