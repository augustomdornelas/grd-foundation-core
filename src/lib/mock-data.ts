// Helpers de formatação. Dados reais vêm do Supabase — não usar seeds aqui.
//
// A formatação mudou de casa: mora em @/lib/formato desde que passou a
// ser usada em produção por todas as telas. O re-export existe só para
// não quebrar os imports antigos.

/**
 * @deprecated Importe `brl` de `@/lib/formato`.
 * Este re-export some assim que os últimos imports migrarem.
 */
export { brl } from "@/lib/formato";
