// Sessão do Portal (/app). Para testar rápido, baixe INATIVIDADE_MINUTOS
// para 1 temporariamente: o aviso abre na hora (60 s antes do fim).

/** Minutos sem atividade até o logout automático. */
export const INATIVIDADE_MINUTOS = 20;

/** Segundos de contagem regressiva no aviso antes do logout. */
export const AVISO_SEGUNDOS = 60;

/** Intervalo mínimo entre dois registros de atividade (throttle). */
export const REGISTRO_ATIVIDADE_MS = 30_000;
