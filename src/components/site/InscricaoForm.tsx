// ============================================================
// Formulário de inscrição — site público
// ------------------------------------------------------------
// Serve às duas telas: a inscrição numa vaga (/vagas/:slug) e o banco
// de talentos (/trabalhe-conosco, quando não há vaga aberta). A única
// diferença é o `vagaSlug`.
//
// Anti-spam sem login e sem serviço externo:
//  - campo isca ("empresa"), invisível para gente e preenchido por bot;
//  - tempo mínimo de preenchimento — robô responde em menos de 3s;
//  - e, no banco, no máximo cinco inscrições por hora para o mesmo CPF.
// Rate limit por IP de verdade exigiria uma edge function na frente;
// isso não existe ainda e está anotado como pendência.
//
// Pensado para o celular primeiro: é onde o pedreiro e o eletricista
// vão preencher, no intervalo, com uma mão só.
// ============================================================
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, AlertTriangle, Loader2, Upload, Plus, X } from "lucide-react";
import { DISPONIBILIDADE_LABEL, cpfValido, formatarCpf, formatarTelefone } from "@/lib/rh-regras";
import { inscrever, type InscricaoInput } from "@/lib/rh-publico";

const NRS_COMUNS = ["NR-06", "NR-10", "NR-11", "NR-12", "NR-18", "NR-33", "NR-35"];

const VAZIO: Omit<InscricaoInput, "vagaSlug"> = {
  nome: "",
  cpf: "",
  email: "",
  telefone: "",
  whatsapp: "",
  cidade: "",
  uf: "",
  cargoPretendido: "",
  disponibilidade: "a_combinar",
  nrs: [],
  experiencia: "",
  lgpd: false,
  curriculo: null,
};

export function InscricaoForm({
  vagaSlug,
  vagaTitulo,
  cargoSugerido,
}: {
  vagaSlug: string | null;
  vagaTitulo?: string;
  cargoSugerido?: string;
}) {
  const [form, setForm] = useState({ ...VAZIO, cargoPretendido: cargoSugerido ?? "" });
  const [isca, setIsca] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [pronto, setPronto] = useState<{ jaInscrito: boolean; email: string } | null>(null);
  const abertoEm = useRef(Date.now());
  const arquivoRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function alternarNr(nr: string) {
    setForm((f) => ({
      ...f,
      nrs: f.nrs.some((n) => n.nr === nr)
        ? f.nrs.filter((n) => n.nr !== nr)
        : [...f.nrs, { nr, validade: null }],
    }));
  }

  const cpfRuim = form.cpf.replace(/\D/g, "").length > 0 && !cpfValido(form.cpf);
  const podeEnviar =
    form.nome.trim().length >= 3 &&
    form.cpf.replace(/\D/g, "").length === 11 &&
    !cpfRuim &&
    (form.email.trim() !== "" || form.telefone.trim() !== "") &&
    form.lgpd &&
    !enviando;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEnviar) return;

    // As duas iscas. Nenhuma delas dá mensagem de erro real: dizer ao
    // robô por que ele falhou é ensiná-lo a passar da próxima vez.
    if (isca.trim() !== "" || Date.now() - abertoEm.current < 3000) {
      setPronto({ jaInscrito: false, email: form.email });
      return;
    }

    setEnviando(true);
    setErro("");
    const r = await inscrever({ ...form, vagaSlug });
    setEnviando(false);
    if (!r.ok) {
      setErro(r.erro ?? "Não foi possível enviar sua inscrição. Tente de novo.");
      return;
    }
    setPronto({ jaInscrito: Boolean(r.jaInscrito), email: r.email ?? form.email });
  }

  if (pronto) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-600" />
        <h3 className="text-xl font-bold text-[#213368]">
          {pronto.jaInscrito ? "Você já estava inscrito" : "Inscrição enviada"}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          {pronto.jaInscrito
            ? "Sua candidatura para esta vaga já estava com a gente. Atualizamos seus dados de contato."
            : vagaSlug
              ? `Recebemos sua candidatura${vagaTitulo ? ` para ${vagaTitulo}` : ""}. O RH analisa e entra em contato.`
              : "Seu currículo entrou no nosso banco de talentos. Quando abrir uma vaga do seu perfil, a gente chama."}
        </p>
        {pronto.email && (
          <p className="mx-auto mt-4 max-w-md rounded-lg bg-muted/50 p-3 text-sm">
            Para acompanhar o processo, entre em{" "}
            <a href="/candidato" className="font-semibold text-[#F37032] underline">
              grupogrdbrasil.com/candidato
            </a>{" "}
            com o e-mail <strong>{pronto.email}</strong>. Você recebe um link de acesso, sem senha.
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-5 rounded-2xl border bg-white p-5 shadow-sm sm:p-7">
      {vagaTitulo && (
        <p className="text-sm text-muted-foreground">
          Você está se candidatando para <strong className="text-[#213368]">{vagaTitulo}</strong>.
        </p>
      )}

      {/* Campo isca: fora da vista e fora da navegação por teclado. */}
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor="empresa-site">Empresa</label>
        <input
          id="empresa-site"
          name="empresa"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={isca}
          onChange={(e) => setIsca(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="i-nome">Nome completo *</Label>
          <Input
            id="i-nome"
            autoComplete="name"
            value={form.nome}
            onChange={(e) => set("nome", e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="i-cpf">CPF *</Label>
          <Input
            id="i-cpf"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={form.cpf}
            onChange={(e) => set("cpf", formatarCpf(e.target.value))}
            className={cpfRuim ? "border-red-500" : ""}
            required
          />
          {cpfRuim && <p className="text-xs text-red-600">CPF inválido — confira os números.</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="i-nasc">Cargo pretendido</Label>
          <Input
            id="i-nasc"
            value={form.cargoPretendido}
            onChange={(e) => set("cargoPretendido", e.target.value)}
            placeholder="Ex.: eletricista industrial"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="i-tel">Telefone *</Label>
          <Input
            id="i-tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(14) 99999-9999"
            value={form.telefone}
            onChange={(e) => set("telefone", formatarTelefone(e.target.value))}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="i-zap">WhatsApp</Label>
          <Input
            id="i-zap"
            inputMode="tel"
            placeholder="(14) 99999-9999"
            value={form.whatsapp}
            onChange={(e) => set("whatsapp", formatarTelefone(e.target.value))}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="i-email">E-mail *</Label>
          <Input
            id="i-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            É por ele que você acompanha o processo na área do candidato.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="i-cidade">Cidade</Label>
          <Input
            id="i-cidade"
            value={form.cidade}
            onChange={(e) => set("cidade", e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="i-uf">UF</Label>
          <Input
            id="i-uf"
            maxLength={2}
            value={form.uf}
            onChange={(e) => set("uf", e.target.value.toUpperCase())}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="i-disp">Quando pode começar</Label>
          <select
            id="i-disp"
            value={form.disponibilidade}
            onChange={(e) => set("disponibilidade", e.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {Object.entries(DISPONIBILIDADE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* NRs — o que mais pesa numa vaga de obra industrial. */}
      <div className="rounded-xl border p-4">
        <Label className="text-sm">Você tem alguma destas NRs?</Label>
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
          Marque as que você tem em dia. Se não tiver nenhuma, tudo bem — pule.
        </p>
        <div className="flex flex-wrap gap-2">
          {NRS_COMUNS.map((nr) => {
            const marcada = form.nrs.some((n) => n.nr === nr);
            return (
              <button
                key={nr}
                type="button"
                onClick={() => alternarNr(nr)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  marcada
                    ? "bg-[#213368] text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {marcada ? (
                  <X className="mr-1 inline h-3 w-3" />
                ) : (
                  <Plus className="mr-1 inline h-3 w-3" />
                )}
                {nr}
              </button>
            );
          })}
        </div>
        {form.nrs.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">Se souber a validade, informe:</p>
            {form.nrs.map((n, i) => (
              <div key={n.nr} className="flex items-center gap-2">
                <span className="w-20 text-sm font-semibold">{n.nr}</span>
                <Input
                  type="date"
                  className="w-44"
                  value={n.validade ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      nrs: f.nrs.map((x, idx) =>
                        idx === i ? { ...x, validade: e.target.value || null } : x,
                      ),
                    }))
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="i-exp">Sua experiência, em poucas linhas</Label>
        <Textarea
          id="i-exp"
          rows={3}
          value={form.experiencia}
          onChange={(e) => set("experiencia", e.target.value)}
          placeholder="Onde já trabalhou, por quanto tempo, que tipo de obra."
        />
      </div>

      <div className="space-y-1.5">
        <Label>Currículo (PDF, DOC ou foto, até 5 MB)</Label>
        <input
          ref={arquivoRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          onChange={(e) => set("curriculo", e.target.files?.[0] ?? null)}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => arquivoRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" />
            {form.curriculo ? "Trocar arquivo" : "Escolher arquivo"}
          </Button>
          <span className="text-sm text-muted-foreground">
            {form.curriculo ? form.curriculo.name : "Nenhum arquivo escolhido"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Não tem currículo pronto? Pode mandar uma foto dele, ou deixar em branco e contar a
          experiência no campo acima.
        </p>
      </div>

      <label className="flex items-start gap-3 rounded-xl bg-muted/40 p-4 text-sm">
        <Checkbox
          checked={form.lgpd}
          onCheckedChange={(v) => set("lgpd", v === true)}
          className="mt-0.5"
          required
        />
        <span>
          Autorizo a GRD a guardar meus dados para processos seletivos. *
          <span className="mt-1 block text-xs text-muted-foreground">
            Guardamos por 24 meses para considerar você em vagas futuras. Depois disso, ou quando
            você pedir, seu cadastro é anonimizado. Você pode pedir acesso, correção ou exclusão a
            qualquer momento pela área do candidato ou falando com o RH.
          </span>
        </span>
      </label>

      {erro && (
        <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={!podeEnviar}
        className="w-full bg-[#F37032] text-base font-semibold text-white hover:bg-[#ff8850] disabled:opacity-50 sm:w-auto"
      >
        {enviando ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
        {enviando ? "Enviando..." : vagaSlug ? "Enviar candidatura" : "Enviar currículo"}
      </Button>
      <p className="text-xs text-muted-foreground">* campos obrigatórios</p>
    </form>
  );
}
