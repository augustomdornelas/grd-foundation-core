import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Uppercase string values in a payload before persisting.
 * Skips keys that must preserve case (emails, urls, ids, dates, docs, phones, files).
 */
const SKIP_UPPER = /(^|_)(id|email|url|foto|link|cpf|cnpj|rg|telefone|whatsapp|cep|senha|password|data|created_at|updated_at|inicio|fim|prevista|real|emissao|validade|vencimento)($|_)/i;

export function upperizePayload<T extends Record<string, unknown>>(obj: T, extraSkip: string[] = []): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" && v.length > 0 && !SKIP_UPPER.test(k) && !extraSkip.includes(k)) {
      out[k] = v.toUpperCase();
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

