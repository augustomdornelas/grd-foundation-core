// ============================================================
// /candidato — a área de quem se candidatou
// ------------------------------------------------------------
// Entrada por magic link: o candidato digita o e-mail e recebe um
// link. Sem senha, porque senha em processo seletivo é atrito puro —
// a pessoa usa isto três vezes na vida e esqueceria.
//
// O que aparece aqui vem de vw_rh_minhas_candidaturas, que filtra
// pelo próprio candidato e NÃO tem score, parecer nem motivo de
// reprovação. Quem não seguiu vê "processo encerrado" — a
// justificativa é dado interno do RH e não sai do banco.
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  LogOut,
  Mail,
  Loader2,
  Upload,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { CookieBanner } from "@/components/site/CookieBanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { TIPO_CONTRATACAO_LABEL, dataBr, dataHoraBr } from "@/lib/rh-regras";
import {
  vincularCandidato,
  minhasCandidaturas,
  meusItensDeAdmissao,
  enviarDocumentoDoCandidato,
  desistirDoProcesso,
  responderProposta,
  situacaoParaCandidato,
  type ItemDoCandidato,
  type MinhaCandidatura,
} from "@/lib/rh-publico";

export const Route = createFileRoute("/candidato")({ ssr: false, component: AreaDoCandidato });

type Estado =
  | { fase: "carregando" }
  | { fase: "deslogado" }
  | { fase: "sem_cadastro"; email: string }
  | { fase: "dentro"; candidatoId: string; email: string };

function AreaDoCandidato() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  const avaliarSessao = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const sessao = data.session;
    if (!sessao?.user) {
      setEstado({ fase: "deslogado" });
      return;
    }
    const email = sessao.user.email ?? "";
    const id = await vincularCandidato();
    setEstado(id ? { fase: "dentro", candidatoId: id, email } : { fase: "sem_cadastro", email });
  }, []);

  useEffect(() => {
    void avaliarSessao();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void avaliarSessao();
    });
    return () => data.subscription.unsubscribe();
  }, [avaliarSessao]);

  return (
    <div className="flex min-h-screen flex-col bg-[#F4F4F4]">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {estado.fase === "carregando" && (
          <div className="space-y-4">
            <div className="h-8 w-56 animate-pulse rounded bg-white" />
            <div className="h-40 animate-pulse rounded-2xl bg-white" />
          </div>
        )}

        {estado.fase === "deslogado" && <Entrar />}

        {estado.fase === "sem_cadastro" && (
          <Card className="p-8 text-center">
            <h1 className="text-xl font-bold text-[#213368]">
              Não achamos cadastro para {estado.email}
            </h1>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Este login não está ligado a nenhuma candidatura. Se você se inscreveu com outro
              e-mail, saia e entre com aquele. Se ainda não se candidatou, comece por aqui.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button asChild className="bg-[#F37032] text-white hover:bg-[#ff8850]">
                <Link to="/trabalhe-conosco">Ver vagas abertas</Link>
              </Button>
              <Button variant="outline" onClick={() => void supabase.auth.signOut()}>
                <LogOut className="mr-1.5 h-4 w-4" /> Sair
              </Button>
            </div>
          </Card>
        )}

        {estado.fase === "dentro" && (
          <Painel candidatoId={estado.candidatoId} email={estado.email} />
        )}
      </main>
      <Footer />
      <CookieBanner />
    </div>
  );
}

// ============================================================
// Entrada por magic link
// ============================================================
function Entrar() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setEnviando(true);
    setErro("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/candidato` },
    });
    setEnviando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <Card className="p-8 text-center">
        <Mail className="mx-auto mb-3 h-12 w-12 text-[#F37032]" />
        <h1 className="text-xl font-bold text-[#213368]">Link enviado</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Mandamos um link de acesso para <strong>{email}</strong>. Abra o e-mail no celular e toque
          no link — ele já entra direto, sem senha.
        </p>
        <p className="mx-auto mt-4 max-w-md text-xs text-muted-foreground">
          Não chegou em alguns minutos? Confira a caixa de spam ou{" "}
          <button className="underline" onClick={() => setEnviado(false)}>
            tente outro e-mail
          </button>
          .
        </p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold text-[#213368]">Acompanhe sua candidatura</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Digite o e-mail que você usou para se candidatar. A gente manda um link de acesso — sem
        senha para decorar.
      </p>
      <form onSubmit={enviar} className="mt-6 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="c-email">E-mail</Label>
          <Input
            id="c-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
          />
        </div>
        {erro && (
          <div className="flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{erro}</span>
          </div>
        )}
        <Button
          type="submit"
          disabled={enviando || !email.includes("@")}
          className="w-full bg-[#F37032] text-white hover:bg-[#ff8850]"
        >
          {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {enviando ? "Enviando..." : "Receber link de acesso"}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-muted-foreground">
        Ainda não se candidatou?{" "}
        <Link to="/trabalhe-conosco" className="font-semibold text-[#F37032] underline">
          Ver vagas abertas
        </Link>
      </p>
    </Card>
  );
}

// ============================================================
// Painel do candidato
// ============================================================
function Painel({ candidatoId, email }: { candidatoId: string; email: string }) {
  const [candidaturas, setCandidaturas] = useState<MinhaCandidatura[] | null>(null);
  const [desistindo, setDesistindo] = useState<MinhaCandidatura | null>(null);

  const recarregar = useCallback(async () => {
    setCandidaturas(await minhasCandidaturas());
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#213368]">Suas candidaturas</h1>
          <p className="text-sm text-muted-foreground">{email}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void supabase.auth.signOut()}>
          <LogOut className="mr-1.5 h-4 w-4" /> Sair
        </Button>
      </div>

      {candidaturas === null ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : candidaturas.length === 0 ? (
        <Card className="p-8 text-center">
          <h2 className="text-lg font-bold text-[#213368]">Seu cadastro está com a gente</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Você ainda não está inscrito em nenhuma vaga específica — seu currículo está no banco de
            talentos. Quando abrir uma vaga do seu perfil, a gente chama.
          </p>
          <Button asChild className="mt-5 bg-[#F37032] text-white hover:bg-[#ff8850]">
            <Link to="/trabalhe-conosco">Ver vagas abertas</Link>
          </Button>
        </Card>
      ) : (
        candidaturas.map((c) => (
          <CandidaturaCard
            key={c.candidaturaId}
            candidatura={c}
            candidatoId={candidatoId}
            onMudou={recarregar}
            onDesistir={() => setDesistindo(c)}
          />
        ))
      )}

      <Card className="p-5">
        <h2 className="text-sm font-bold text-[#213368]">Seus dados e a LGPD</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Guardamos seus dados por 24 meses para considerar você em vagas futuras. Você pode pedir
          acesso, correção ou exclusão a qualquer momento — é só falar com o RH pelo WhatsApp da GRD
          ou responder o e-mail que você recebeu. A exclusão apaga nome, CPF, contatos e currículo.
        </p>
      </Card>

      <DesistirDialog
        candidatura={desistindo}
        onFechar={() => setDesistindo(null)}
        onPronto={() => {
          setDesistindo(null);
          void recarregar();
        }}
      />
    </div>
  );
}

const TOM_ESTILO: Record<string, string> = {
  andamento: "bg-sky-50 text-sky-800 border-sky-200",
  bom: "bg-emerald-50 text-emerald-800 border-emerald-200",
  encerrado: "bg-muted text-muted-foreground border-muted",
};

function CandidaturaCard({
  candidatura,
  candidatoId,
  onMudou,
  onDesistir,
}: {
  candidatura: MinhaCandidatura;
  candidatoId: string;
  onMudou: () => void;
  onDesistir: () => void;
}) {
  const [itens, setItens] = useState<ItemDoCandidato[]>([]);
  const situacao = situacaoParaCandidato(candidatura);
  const emAndamento = candidatura.status === "em_andamento";
  const naProposta = candidatura.etapaNome.toLowerCase().includes("proposta");

  useEffect(() => {
    let vivo = true;
    if (!candidatura.admissaoId) {
      setItens([]);
      return;
    }
    void meusItensDeAdmissao(candidatura.admissaoId).then((i) => {
      if (vivo) setItens(i);
    });
    return () => {
      vivo = false;
    };
  }, [candidatura.admissaoId]);

  async function recarregarItens() {
    if (candidatura.admissaoId) setItens(await meusItensDeAdmissao(candidatura.admissaoId));
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#213368]">{candidatura.vagaTitulo}</h2>
            <p className="text-sm text-muted-foreground">
              {TIPO_CONTRATACAO_LABEL[candidatura.tipoContratacao] ?? candidatura.tipoContratacao}
              {candidatura.localTrabalho || candidatura.cidade
                ? ` · ${candidatura.localTrabalho || candidatura.cidade}`
                : ""}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Inscrito em {dataBr(candidatura.dataInscricao)}
          </p>
        </div>

        <div className={`mt-4 rounded-xl border p-4 ${TOM_ESTILO[situacao.tom]}`}>
          <p className="font-semibold">{situacao.titulo}</p>
          <p className="mt-0.5 text-sm">{situacao.detalhe}</p>
          <p className="mt-2 text-xs opacity-70">
            Última atualização em {dataHoraBr(candidatura.dataUltimaMovimentacao)}
          </p>
        </div>
      </div>

      {/* ---------- Documentos da admissão ---------- */}
      {itens.length > 0 && (
        <div className="border-b p-5">
          <h3 className="text-sm font-bold text-[#213368]">Documentos que precisamos de você</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pode fotografar com o celular, desde que dê para ler.
          </p>
          <div className="mt-3 divide-y rounded-lg border">
            {itens.map((item) => (
              <ItemUpload
                key={item.id}
                item={item}
                candidatoId={candidatoId}
                onEnviado={recarregarItens}
              />
            ))}
          </div>
        </div>
      )}

      {/* ---------- Ações ---------- */}
      {emAndamento && (
        <div className="flex flex-wrap items-center gap-2 p-5">
          {naProposta && (
            <>
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={async () => {
                  const r = await responderProposta(candidatura.candidaturaId, true, "");
                  if (r.ok) {
                    toast.success("Resposta registrada. O RH já foi avisado.");
                    onMudou();
                  } else toast.error(r.erro ?? "Não foi possível registrar.");
                }}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" /> Aceitar a proposta
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const r = await responderProposta(candidatura.candidaturaId, false, "");
                  if (r.ok) {
                    toast.success("Resposta registrada.");
                    onMudou();
                  } else toast.error(r.erro ?? "Não foi possível registrar.");
                }}
              >
                <XCircle className="mr-1.5 h-4 w-4" /> Recusar
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onDesistir}>
            Desistir deste processo
          </Button>
        </div>
      )}
    </Card>
  );
}

function ItemUpload({
  item,
  candidatoId,
  onEnviado,
}: {
  item: ItemDoCandidato;
  candidatoId: string;
  onEnviado: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  const rotulo: Record<string, { texto: string; classe: string }> = {
    pendente: { texto: "Falta enviar", classe: "bg-amber-100 text-amber-800" },
    enviado: { texto: "Enviado, em conferência", classe: "bg-sky-100 text-sky-800" },
    aprovado: { texto: "Aprovado", classe: "bg-emerald-100 text-emerald-800" },
    reprovado: { texto: "Precisa reenviar", classe: "bg-red-100 text-red-700" },
    dispensado: { texto: "Não precisa", classe: "bg-muted text-muted-foreground" },
  };
  const estado = rotulo[item.status] ?? rotulo.pendente;
  const resolvido = item.status === "aprovado" || item.status === "dispensado";

  async function enviar(arquivo: File) {
    setEnviando(true);
    const r = await enviarDocumentoDoCandidato(item, candidatoId, arquivo);
    setEnviando(false);
    if (r.ok) {
      toast.success(`${item.titulo} enviado.`);
      onEnviado();
    } else toast.error(r.erro ?? "Não foi possível enviar.");
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-[#213368]">{item.titulo}</p>
          {item.obrigatorio && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              obrigatório
            </span>
          )}
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${estado.classe}`}>
            {estado.texto}
          </span>
        </div>
        {item.instrucoes && (
          <p className="mt-0.5 text-xs text-muted-foreground">{item.instrucoes}</p>
        )}
      </div>

      {!resolvido && (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void enviar(f);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={enviando}
            onClick={() => inputRef.current?.click()}
          >
            {enviando ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : item.arquivoPath ? (
              <FileText className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" />
            )}
            {item.arquivoPath ? "Enviar de novo" : "Enviar"}
          </Button>
        </>
      )}
      {resolvido && <Clock className="h-4 w-4 text-emerald-600" aria-hidden />}
    </div>
  );
}

function DesistirDialog({
  candidatura,
  onFechar,
  onPronto,
}: {
  candidatura: MinhaCandidatura | null;
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (candidatura) setMotivo("");
  }, [candidatura]);

  return (
    <Dialog
      open={candidatura !== null}
      onOpenChange={(a) => {
        if (!a && !salvando) onFechar();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Desistir de {candidatura?.vagaTitulo}</DialogTitle>
          <DialogDescription>
            Seu processo nesta vaga é encerrado. Seu cadastro continua com a gente para vagas
            futuras — e se mudar de ideia, é só falar com o RH.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="d-motivo">Quer contar o motivo? (opcional)</Label>
          <Textarea
            id="d-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: consegui outra colocação; a obra fica longe da minha casa."
          />
          <p className="text-xs text-muted-foreground">
            Ajuda a GRD a melhorar o processo. Fica visível só para o RH.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvando}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={salvando}
            onClick={async () => {
              if (!candidatura) return;
              setSalvando(true);
              const r = await desistirDoProcesso(candidatura.candidaturaId, motivo);
              setSalvando(false);
              if (!r.ok) {
                toast.error(r.erro ?? "Não foi possível registrar.");
                return;
              }
              toast.success("Registrado. Obrigado por avisar.");
              onPronto();
            }}
          >
            {salvando ? "Registrando..." : "Confirmar desistência"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
