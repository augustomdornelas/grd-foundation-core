// ============================================================
// Card "OneDrive — Orçamentos" da tela /app/integracoes
// ------------------------------------------------------------
// É o único card interativo da lista: os outros levam para a tela da
// integração, este dispara o job. Ele existe como componente separado
// porque a rota é uma lista de cards estáticos, e enfiar estado,
// sessão e fetch lá dentro transformaria a lista num painel.
//
// O QUE ELE MOSTRA VEM DE `vw_onedrive_sync`, a view do diário — e não
// da tabela `onedrive_sync_log`, que é fechada e guarda o token de
// continuação do Graph. A tela lê situação e data; o token não
// atravessa.
//
// FALHA DE SYNC VIRA AVISO, NUNCA PÁGINA EM BRANCO. São três estados
// diferentes e a tela separa os três: erro ao ler o diário (o Supabase
// não respondeu), erro ao disparar (o endpoint recusou ou a
// configuração falta) e execução que rodou e falhou (o `erro` gravado
// na última linha do diário).
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  HardDrive,
  ListChecks,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dataHoraBr } from "@/lib/rh-regras";

/** Uma execução, como a view devolve. Sem `delta_link`: ver o cabeçalho. */
type LinhaSync = {
  id: string;
  ano: number;
  iniciado_em: string;
  terminado_em: string | null;
  status: "rodando" | "ok" | "parcial" | "erro";
  pastas: number;
  importados: number;
  ja_existentes: number;
  ignorados: number;
  detalhe: string;
  erro: string | null;
  disparado_por: string;
};

/** O que o endpoint devolve. Só o que a tela usa. */
type RespostaSync = {
  ok?: boolean;
  status?: "ok" | "parcial" | "erro";
  importados?: number;
  vinculados?: number;
  jaExistentes?: number;
  pastasNoDrive?: number;
  faltando?: string[];
  detalhe?: string;
  erro?: string;
};

/**
 * As duas maneiras de sincronizar, e a diferença é de pergunta.
 *
 * `incremental` pergunta ao delta o que mudou desde a última vez. É o do
 * agendador: barato, uma requisição.
 * `completa` lê a pasta inteira por /children e reconcilia. Existe
 * porque o delta é destrutivo — consumido o token, o que não mudou não
 * volta —, então uma pasta que ficou para trás só reaparece assim.
 */
type Modo = "incremental" | "completa";

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

function situacao(linha: LinhaSync | null): { texto: string; classe: string; ativa: boolean } {
  if (!linha) return { texto: "Nunca sincronizado", classe: "", ativa: false };
  if (linha.status === "rodando") return { texto: "Sincronizando…", classe: "", ativa: false };
  if (linha.status === "erro") {
    return {
      texto: "Última tentativa falhou",
      classe: "bg-red-600 hover:bg-red-600/80",
      ativa: true,
    };
  }
  if (linha.status === "parcial") {
    return {
      texto: "Ativo — há o que conferir",
      classe: "bg-amber-500 hover:bg-amber-500/80",
      ativa: true,
    };
  }
  return { texto: "Ativo", classe: "bg-emerald-600 hover:bg-emerald-600/80", ativa: true };
}

export function CardOneDrive() {
  const [linha, setLinha] = useState<LinhaSync | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroDeLeitura, setErroDeLeitura] = useState<string | null>(null);
  /** Qual dos dois botões está rodando, ou null. Guardar o modo (e não
   *  um booleano) é o que permite desabilitar os dois e girar só o que
   *  foi clicado. */
  const [sincronizando, setSincronizando] = useState<Modo | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data, error } = await supabase
        .from("vw_onedrive_sync")
        .select("*")
        .order("iniciado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Sem toast: um erro de leitura aqui não pode virar popup na cara
      // de quem só abriu a tela de Integrações. Vira linha no card.
      setErroDeLeitura(error ? error.message : null);
      setLinha(error ? null : ((data as LinhaSync | null) ?? null));
    } catch (e) {
      setErroDeLeitura(e instanceof Error ? e.message : String(e));
      setLinha(null);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const sincronizar = useCallback(
    async (modo: Modo) => {
      setSincronizando(modo);
      setAviso(null);
      try {
        // A sessão do Supabase vive no localStorage, então o JWT precisa
        // ser lido e mandado no header — é a porta 2 do endpoint. O
        // segredo do agendador (ONEDRIVE_SYNC_TOKEN) não pode vir para o
        // navegador: qualquer coisa no bundle é pública.
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          setAviso({ tipo: "erro", texto: "Sessão expirada. Entre de novo para sincronizar." });
          return;
        }

        const resposta = await fetch(
          `/api/onedrive/sync${modo === "completa" ? "?completo=1" : ""}`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` } },
        );

        // O corpo pode não ser JSON quando um proxy responde no lugar do
        // servidor. Ler como texto primeiro evita o "Unexpected token <"
        // que esconderia o erro de verdade.
        const bruto = await resposta.text();
        let corpo: RespostaSync;
        try {
          corpo = JSON.parse(bruto) as RespostaSync;
        } catch {
          setAviso({
            tipo: "erro",
            texto: `Resposta inesperada (HTTP ${resposta.status}): ${bruto.slice(0, 160)}`,
          });
          return;
        }

        if (!resposta.ok || corpo.ok !== true) {
          setAviso({ tipo: "erro", texto: corpo.erro || `Falhou (HTTP ${resposta.status}).` });
        } else {
          // Criado e vinculado são coisas diferentes e a frase separa as
          // duas: vincular anexa a pasta a um orçamento que já existia e
          // não pede conferência nenhuma; criar é que gera rascunho novo.
          const feitos = [
            corpo.importados ? `${corpo.importados} orçamento(s) criado(s)` : "",
            corpo.vinculados
              ? `${corpo.vinculados} pasta(s) vinculada(s) a orçamento já lançado`
              : "",
          ].filter(Boolean);

          // PASTA FALTANDO NÃO É SUCESSO, mesmo com HTTP 200 e ok:true. O
          // job rodou, mas o Portal não tem o que o drive tem — e foi
          // exatamente esse caso que passou por "tudo sincronizado".
          if (corpo.faltando?.length) {
            setAviso({
              tipo: "erro",
              texto:
                `${corpo.faltando.length} pasta(s) do drive sem orçamento no Portal: ` +
                `${corpo.faltando.slice(0, 8).join(", ")}${corpo.faltando.length > 8 ? "…" : ""}. ` +
                "Rode a varredura completa.",
            });
          } else {
            setAviso({
              tipo: "ok",
              texto: feitos.length
                ? `${feitos.join(" e ")}.${corpo.importados ? " Confira no Comercial." : ""}`
                : `Nada novo: as ${corpo.pastasNoDrive ?? 0} pastas do drive já estão no Portal.`,
            });
          }
        }
      } catch (e) {
        setAviso({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
      } finally {
        setSincronizando(null);
        // Recarrega em qualquer caso: mesmo a execução que falhou deixou
        // linha no diário, e é ela que a tela deve passar a mostrar.
        await carregar();
      }
    },
    [carregar],
  );

  const st = situacao(linha);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#213368]/10">
          <HardDrive className="h-5 w-5 text-[#213368]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[#213368]">OneDrive — Orçamentos</h3>
            <Badge variant={st.ativa ? "default" : "secondary"} className={st.classe}>
              {st.texto}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            As pastas de orçamento do Comercial. O job lê o nome da pasta e cria o rascunho; os
            arquivos de dentro ficam para a etapa seguinte.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
        {carregando ? (
          <span className="text-muted-foreground">Lendo o diário…</span>
        ) : erroDeLeitura ? (
          <span className="text-red-700">
            Não foi possível ler o diário de sincronização: {erroDeLeitura}
          </span>
        ) : !linha ? (
          <span className="text-muted-foreground">
            Ainda não rodou nenhuma vez. O primeiro "Sincronizar agora" varre a pasta inteira.
          </span>
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-[#213368]">
              Última sincronização: {dataHoraBr(linha.terminado_em ?? linha.iniciado_em)}
              {linha.disparado_por ? ` · por ${linha.disparado_por}` : ""}
            </span>
            <span className="text-muted-foreground">
              {linha.importados} importado(s) · {linha.ja_existentes} já existia(m) · {linha.pastas}{" "}
              pasta(s) de {linha.ano} no drive
            </span>
            {linha.detalhe && <span className="text-muted-foreground">{linha.detalhe}</span>}
            {linha.erro && <span className="text-red-700">Erro: {linha.erro}</span>}
          </div>
        )}
      </div>

      {aviso && (
        <div
          className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
            aviso.tipo === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {aviso.tipo === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span>{aviso.texto}</span>
        </div>
      )}

      {/* DOIS BOTÕES, e o segundo não é "o primeiro com mais força".
          "Sincronizar agora" pergunta ao delta o que mudou — é o do
          dia a dia e o que o agendador chama.
          "Varredura completa" lê a pasta inteira e reconcilia. É o
          conserto para quando alguma pasta ficou para trás, porque o
          delta não devolve de novo o que não mudou. Custa mais e não
          precisa ser rotina, daí o rótulo dizer o que ela faz. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={sincronizando !== null}
          onClick={() => void sincronizar("incremental")}
        >
          {sincronizando === "incremental" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          {sincronizando === "incremental" ? "Sincronizando…" : "Sincronizar agora"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          disabled={sincronizando !== null}
          onClick={() => void sincronizar("completa")}
          title="Lê a pasta inteira no OneDrive e reconcilia com o Portal. Use quando faltar orçamento."
        >
          {sincronizando === "completa" ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <ListChecks className="mr-1.5 h-3.5 w-3.5" />
          )}
          {sincronizando === "completa" ? "Varrendo tudo…" : "Varredura completa"}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        <b>Sincronizar agora</b> traz só o que mudou desde a última vez. <b>Varredura completa</b>{" "}
        relê a pasta inteira e recupera o que tenha ficado para trás — mais lenta, e é a saída
        quando o diário acusar pasta faltando.
      </p>
    </Card>
  );
}
