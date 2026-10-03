// ============================================================
// Última atividade do usuário no Portal, compartilhada entre abas
// ------------------------------------------------------------
// O horário fica no localStorage: todas as abas leem o mesmo valor, então
// atividade em uma renova todas, e depois de o computador dormir o tempo
// real é conferido pelo relógio, não por um setTimeout que parou.
// O BroadcastChannel só avisa as outras abas na hora (renovou / saiu);
// o evento `storage` cobre navegador sem BroadcastChannel.
// ============================================================

const CHAVE = "grd:ultima-atividade";
const CANAL = "grd-sessao";

export type MensagemSessao = { tipo: "atividade"; em: number } | { tipo: "logout" };

/** Último registro de atividade (ms), ou null se não há (ou o storage está bloqueado). */
export function lerUltimaAtividade(): number | null {
  try {
    const v = Number(localStorage.getItem(CHAVE));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function gravarUltimaAtividade(em: number) {
  try {
    localStorage.setItem(CHAVE, String(em));
  } catch {
    /* storage bloqueado: a aba segue com o valor em memória */
  }
}

/** Login acabou de acontecer: o tempo conta a partir de agora. */
export function marcarAtividadeAgora() {
  gravarUltimaAtividade(Date.now());
}

/** Logout (manual ou por inatividade): o próximo login começa do zero. */
export function limparUltimaAtividade() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* noop */
  }
}

export function ehChaveDeAtividade(chave: string | null) {
  return chave === CHAVE;
}

export function abrirCanalSessao(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CANAL);
  } catch {
    return null;
  }
}
