// ============================================================
// /app/colaboradores/secullum — importar da Secullum e conciliar
// ------------------------------------------------------------
// Veio de /app/ponto/integracao. Lá ficou o que é da INTEGRAÇÃO
// (conexão, licença, catálogos); aqui fica o que é do CADASTRO: trazer
// para o Portal quem bate ponto e não existe aqui, e mostrar quem está
// de um lado e não do outro.
//
// Só Diretoria e RH/DP (PERFIS_RH.integracoes). A tela não fala com a
// Secullum: chama as server functions, que rodam no servidor e são as
// únicas com a credencial.
// ============================================================
import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw, PlugZap, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RhTela } from "@/components/rh/RhTela";
import { PERFIS_RH } from "@/lib/current-user";
import {
  obterEstadoSecullum,
  obterCadastroSecullum,
  type CadastroSecullum,
  type EstadoIntegracao,
} from "@/lib/secullum-server";
import { CargaInicialSecullum } from "@/components/rh/CargaInicialSecullum";
import { ConciliacaoSecullum } from "@/components/colaboradores/ConciliacaoSecullum";

export const Route = createFileRoute("/app/colaboradores/secullum")({
  ssr: false,
  component: ImportarSecullum,
});

function ImportarSecullum() {
  const [estado, setEstado] = useState<EstadoIntegracao | null>(null);
  const [cadastro, setCadastro] = useState<CadastroSecullum | null>(null);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const e = await obterEstadoSecullum();
    setEstado(e);
    setCadastro(e.configurado && !e.erro ? await obterCadastroSecullum() : null);
    setCarregando(false);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <RhTela
      titulo="Importar da Secullum"
      resumo="O Portal é dono do cadastro; a Secullum é dona do ponto. Aqui entra no Portal quem bate ponto e ainda não tem cadastro, e aparece quem está de um lado e não do outro."
      perfis={PERFIS_RH.integracoes}
    >
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => void carregar()} disabled={carregando}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${carregando ? "animate-spin" : ""}`} />
            {carregando ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>

        {!estado ? (
          <Card className="p-6">
            <div className="h-5 w-52 animate-pulse rounded bg-muted" />
          </Card>
        ) : !estado.configurado || estado.erro ? (
          // O diagnóstico completo (o que falta, licença, catálogos) é
          // da tela de integração; aqui só se diz que não dá e onde ver.
          <Card
            className={`p-5 ${estado.configurado ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
          >
            <div className="flex gap-3">
              {estado.configurado ? (
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              ) : (
                <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              )}
              <div>
                <p className="font-semibold text-[#213368]">
                  {estado.configurado
                    ? "Não foi possível falar com a Secullum"
                    : "Integração não configurada no servidor"}
                </p>
                <p className="mt-1 text-sm">
                  {estado.erro || `Falta ${estado.faltando} no ambiente de quem roda o Portal.`}
                </p>
                <Button asChild size="sm" variant="outline" className="mt-3">
                  <Link to="/app/ponto/integracao">Ver a integração no Ponto</Link>
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <>
            {/* A carga inicial vem antes da conciliação: enquanto houver
                gente batendo ponto fora do cadastro do Portal, é o
                assunto mais importante da tela. Some sozinha quando a
                carga termina. */}
            {cadastro && !cadastro.erro && (
              <CargaInicialSecullum
                ativos={cadastro.ativos}
                camposAusentes={cadastro.camposAusentes}
              />
            )}
            <ConciliacaoSecullum cadastro={cadastro} />
          </>
        )}
      </div>
    </RhTela>
  );
}
