// ============================================================
// /app/integracoes/contaazul — o OAuth, ligado
// ------------------------------------------------------------
// A conexão com a Conta Azul é OAuth2: o Portal manda o usuário ao
// autorizador da Conta Azul, recebe um code de volta na redirect_uri e
// troca esse code por um par de tokens, que ficam no servidor.
//
// ESTA TELA NÃO VÊ TOKEN NENHUM. Ela chama as server functions de
// contaazul-server.ts, que devolvem situação e datas; o access_token e
// o refresh_token não atravessam essa fronteira. O client_secret
// também não aparece aqui e não vai aparecer: ele mora no ambiente do
// servidor, e uma tela que o exibisse o entregaria a qualquer um com
// acesso ao Admin.
//
// POR QUE HÁ DOIS CAMINHOS PARA AUTORIZAR
//
// A redirect_uri deste App é https://contaazul.com/ e não pode ser
// alterada. Então o retorno automático — /api/contaazul/callback — não
// fecha o ciclo em desenvolvimento: o navegador para no site da Conta
// Azul, com o `code` na barra de endereços, e nunca volta ao Portal.
//
//   1. O BOTÃO passa por /api/contaazul/conectar. É o caminho de
//      produção: o endpoint confere a sessão, assina o state num
//      cookie e manda para o autorizador. No dia em que a redirect_uri
//      apontar para o Portal, esse caminho fecha sozinho.
//   2. O LINK e a CAIXA DE CÓDIGO são o atalho de desenvolvimento:
//      abre-se a autorização em outra aba, copia-se o `code` da barra
//      de endereços e cola-se aqui. A troca acontece no servidor, numa
//      server function que exige Administrador ou Diretoria.
//
// Os dois existem lado a lado de propósito, e a tela diz qual é qual —
// esconder o segundo faria o desenvolvimento depender de uma
// configuração que não está em nossas mãos.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  Link2,
  Loader2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { LinhaEmBreve, TelaModulo } from "@/components/portal/TelaModulo";
import { supabase } from "@/integrations/supabase/client";
import { dataHoraBr } from "@/lib/rh-regras";
import {
  obterEstadoContaAzul,
  trocarCodigoContaAzul,
  desconectarContaAzul,
  type EstadoContaAzul,
} from "@/lib/contaazul-server";

export const Route = createFileRoute("/app/integracoes/contaazul")({
  ssr: false,
  component: IntegracaoContaAzul,
});

/** Recado a mostrar, e de que tipo. `null` = nada aconteceu ainda. */
type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

/** O access_token da sessão, que as server functions exigem para
 *  conferir o perfil. Sem sessão não há o que fazer nesta tela. */
async function tokenDaSessao(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function IntegracaoContaAzul() {
  const [estado, setEstado] = useState<EstadoContaAzul | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [trabalhando, setTrabalhando] = useState<"conectar" | "trocar" | "desconectar" | null>(
    null,
  );
  const [codigo, setCodigo] = useState("");
  const [aviso, setAviso] = useState<Aviso>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setEstado(await obterEstadoContaAzul());
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O retorno do /api/contaazul/callback chega como ?contaazul=ok|erro.
  // Lido do endereço e apagado em seguida: um F5 depois não deve
  // repetir um recado sobre algo que já aconteceu.
  useEffect(() => {
    const busca = new URLSearchParams(window.location.search);
    const resultado = busca.get("contaazul");
    if (!resultado) return;

    setAviso(
      resultado === "ok"
        ? { tipo: "ok", texto: "Conta Azul conectada." }
        : { tipo: "erro", texto: busca.get("motivo") || "A autorização não foi concluída." },
    );
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // ---------- Ações ----------

  /** Caminho de produção: passa pelo endpoint, que assina o state. */
  const conectar = useCallback(async () => {
    setTrabalhando("conectar");
    setAviso(null);
    try {
      const token = await tokenDaSessao();
      if (!token) {
        setAviso({ tipo: "erro", texto: "Sessão expirada. Entre de novo." });
        return;
      }

      // `fetch` e não um link: o Authorization é obrigatório, e um
      // `<a href>` não tem como mandá-lo. O Set-Cookie desta resposta
      // é gravado normalmente por ser de mesma origem — é ele que
      // mantém o state válido na volta.
      const resposta = await fetch("/api/contaazul/conectar", {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const corpo = (await resposta.json()) as { ok?: boolean; url?: string; erro?: string };

      if (!resposta.ok || !corpo.url) {
        setAviso({ tipo: "erro", texto: corpo.erro ?? `Falha (HTTP ${resposta.status}).` });
        return;
      }
      window.location.href = corpo.url;
    } catch (e) {
      setAviso({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setTrabalhando(null);
    }
  }, []);

  const trocar = useCallback(async () => {
    setTrabalhando("trocar");
    setAviso(null);
    try {
      const token = await tokenDaSessao();
      if (!token) {
        setAviso({ tipo: "erro", texto: "Sessão expirada. Entre de novo." });
        return;
      }
      const r = await trocarCodigoContaAzul({ data: { token, code: codigo } });
      if (r.ok) {
        setCodigo("");
        setAviso({ tipo: "ok", texto: "Conta Azul conectada." });
        await carregar();
      } else {
        setAviso({ tipo: "erro", texto: r.erro ?? "Não foi possível trocar o código." });
      }
    } finally {
      setTrabalhando(null);
    }
  }, [codigo, carregar]);

  const desconectar = useCallback(async () => {
    setTrabalhando("desconectar");
    setAviso(null);
    try {
      const token = await tokenDaSessao();
      if (!token) {
        setAviso({ tipo: "erro", texto: "Sessão expirada. Entre de novo." });
        return;
      }
      const r = await desconectarContaAzul({ data: { token } });
      setAviso(
        r.ok
          ? { tipo: "ok", texto: "Conexão removida do Portal." }
          : { tipo: "erro", texto: r.erro ?? "Não foi possível desconectar." },
      );
      await carregar();
    } finally {
      setTrabalhando(null);
    }
  }, [carregar]);

  // ---------- Desenho ----------
  const status = estado?.status;
  const configurado = estado?.configurado === true;
  const conectado = status?.conectado === true;

  return (
    <TelaModulo
      titulo="Conta Azul"
      resumo="A conexão que vai alimentar o módulo Financeiro com os títulos a receber e a pagar. A autorização é feita uma vez; o Portal renova os tokens sozinho."
      perm="admin"
    >
      {aviso && (
        <Card
          className={`flex items-start gap-2.5 p-4 ${
            aviso.tipo === "ok"
              ? "border-emerald-600/40 bg-emerald-50"
              : "border-destructive/40 bg-destructive/5"
          }`}
        >
          {aviso.tipo === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          )}
          <p className="text-sm">{aviso.texto}</p>
        </Card>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-[#213368]">Conexão OAuth</h3>
            <SeloDeSituacao
              carregando={carregando}
              configurado={configurado}
              conectado={conectado}
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {!carregando && !configurado && (
          <p className="mt-2 max-w-3xl text-sm text-destructive">
            Faltam credenciais no ambiente do servidor:{" "}
            <span className="font-mono text-xs">{estado?.faltando}</span>. Cadastre no painel do
            host — nunca no .env versionado e nunca com prefixo VITE_, que publicaria o segredo no
            navegador.
          </p>
        )}

        {estado?.erro && (
          <p className="mt-2 max-w-3xl text-sm text-destructive">
            Não foi possível ler a situação da conexão: {estado.erro}
          </p>
        )}

        {/* O que a tela sabe quando está conectada. Nenhum token aqui —
            só as datas, que são o que separa uma integração viva de uma
            que parou de renovar há três dias. */}
        {conectado && status && (
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Dado rotulo="Conectado em" valor={dataHoraBr(status.conectadoEm)} />
            <Dado rotulo="Última renovação" valor={dataHoraBr(status.renovadoEm)} />
            <Dado
              rotulo="Token atual vence"
              valor={dataHoraBr(status.expiraEm)}
              detalhe={
                status.vencido
                  ? "Vencido — a próxima chamada renova sozinha."
                  : "Renovação automática 5 min antes."
              }
            />
            <Dado rotulo="Autorizado por" valor={status.conectadoPor || "—"} />
          </dl>
        )}

        <div className="mt-5 space-y-1.5">
          <Label htmlFor="redirect_uri">redirect_uri cadastrada no App</Label>
          <Input
            id="redirect_uri"
            readOnly
            value={estado?.redirectUri ?? ""}
            placeholder={carregando ? "Carregando..." : "Não configurada"}
            className="bg-muted/50 font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Tem que bater com a da Conta Azul caractere por caractere — é o que ela compara na hora
            de trocar o código. Uma barra a mais no fim já derruba a troca.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void conectar()}
            disabled={!configurado || trabalhando !== null}
            className="bg-[#F37032] text-white hover:bg-[#ff8850]"
          >
            {trabalhando === "conectar" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-1.5 h-4 w-4" />
            )}
            {conectado ? "Reconectar com a Conta Azul" : "Conectar com a Conta Azul"}
          </Button>

          {conectado && (
            <Button
              variant="outline"
              onClick={() => void desconectar()}
              disabled={trabalhando !== null}
            >
              {trabalhando === "desconectar" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Unplug className="mr-1.5 h-4 w-4" />
              )}
              Desconectar
            </Button>
          )}

          {!configurado && !carregando && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Aguardando as credenciais no ambiente do servidor
            </span>
          )}
        </div>
      </Card>

      {/* ---------------------------------------------------------
          O atalho de desenvolvimento. Ver o cabeçalho do arquivo.
          --------------------------------------------------------- */}
      <Card className="p-5">
        <h3 className="text-base font-bold text-[#213368]">
          Autorizar à mão (enquanto a redirect_uri for externa)
        </h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          A redirect_uri deste App aponta para fora do Portal, então a Conta Azul devolve o código
          numa página que não é esta e o retorno automático não fecha. Abra a autorização, copie o{" "}
          <span className="font-mono text-xs">code</span> que aparecer na barra de endereços e cole
          abaixo. Pode colar a URL inteira — o servidor extrai o código.
        </p>

        <div className="mt-4">
          {estado?.urlDeAutorizacao ? (
            <Button asChild variant="outline" size="sm">
              <a href={estado.urlDeAutorizacao} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Abrir autorização em nova aba
              </a>
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              O link aparece quando as credenciais estiverem no ambiente do servidor.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="code">Código de autorização</Label>
            <Input
              id="code"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="cole aqui o code (ou a URL inteira)"
              className="font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button
            onClick={() => void trocar()}
            disabled={!configurado || codigo.trim() === "" || trabalhando !== null}
          >
            {trabalhando === "trocar" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Trocar por token
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          O código vale uma vez só e por 3 minutos — é o prazo que a própria Conta Azul informa. Se
          a troca for recusada, abra a autorização de novo e traga um código novo; um code já
          consumido não volta a valer.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-bold text-[#213368]">Últimas sincronizações</h3>
          <p className="text-xs text-muted-foreground">
            Uma linha por execução, com o que entrou e o que falhou. Nada é espelhado ainda — a
            leitura de contas a pagar e a receber é a próxima etapa.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>O que</TableHead>
                <TableHead className="text-right">Registros</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <LinhaEmBreve colunas={4} />
            </TableBody>
          </Table>
        </div>
      </Card>
    </TelaModulo>
  );
}

/** Três estados, e não dois: "não configurado" é diferente de "não
 *  conectado" — um se resolve no painel do host, o outro num clique. */
function SeloDeSituacao({
  carregando,
  configurado,
  conectado,
}: {
  carregando: boolean;
  configurado: boolean;
  conectado: boolean;
}) {
  if (carregando) return <Badge variant="secondary">Verificando...</Badge>;
  if (!configurado) return <Badge variant="destructive">Sem credenciais</Badge>;
  if (!conectado) return <Badge variant="secondary">Não conectado</Badge>;
  return <Badge className="bg-emerald-600 hover:bg-emerald-600/80">Conectado</Badge>;
}

function Dado({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="font-semibold text-[#213368]">{valor}</dd>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}
