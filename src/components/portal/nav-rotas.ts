/** Uma rota está ativa quando é ela mesma ou um descendente dela.
 *  A barra ao final evita que /app/rh case com /app/rhx.
 *  `exact` casa só com a rota exata — necessário no índice de um grupo
 *  (/app/rh), que senão fica aceso em todos os filhos. */
export function rotaAtiva(pathname: string, to: string, exact?: boolean): boolean {
  if (exact) return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}
