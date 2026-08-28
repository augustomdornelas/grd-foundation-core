// Formulário de EPI — saiu de app.epis.tsx quando as abas viraram
// rotas. Usado pela aba Catálogo de EPIs.
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, Trash2, Upload, Image as ImageIcon } from "lucide-react";
import { InputNumero } from "@/components/ui/input-moeda";
import { supabase } from "@/integrations/supabase/client";
import { epiActions, type Epi } from "@/lib/epis-store";

export function EpiFormDialog({ epi, onClose }: { epi: Epi | null; onClose: () => void }) {
  const [form, setForm] = useState({
    nome: epi?.nome ?? "",
    ca: epi?.ca ?? "",
    categoria: epi?.categoria ?? "",
    descricao: epi?.descricao ?? "",
    fabricante: epi?.fabricante ?? "",
    validadeDias: epi ? epi.validadeDias : (null as number | null),
    caValidade: epi?.caValidade ?? "",
    estoque: epi ? epi.estoque : (0 as number | null),
    unidade: epi?.unidade ?? "un",
    fotoUrl: epi?.fotoUrl ?? "",
    ativo: epi?.ativo ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  // Mesmo padrão de upload do PortfolioAdmin: sobe para o Storage e guarda a
  // URL pública. Precisa ser pública porque o termo em PDF busca a imagem.
  const enviarFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    setEnviandoFoto(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("epis").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("epis").getPublicUrl(path);
      setForm((f) => ({ ...f, fotoUrl: data.publicUrl }));
      toast.success("Foto enviada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no upload.");
    } finally {
      setEnviandoFoto(false);
      if (fotoRef.current) fotoRef.current.value = "";
    }
  };

  const salvar = async () => {
    if (!form.nome.trim()) return toast.error("Informe o nome do EPI");
    setSaving(true);
    const payload = {
      nome: form.nome.trim(),
      ca: form.ca.trim(),
      categoria: form.categoria.trim(),
      descricao: form.descricao.trim(),
      fabricante: form.fabricante.trim(),
      validadeDias: Math.max(0, form.validadeDias ?? 0),
      // String vazia (e não undefined) para que limpar a data realmente
      // grave null no banco — atualizarEpi ignora campos undefined.
      caValidade: form.caValidade,
      estoque: Math.max(0, form.estoque ?? 0),
      unidade: form.unidade.trim() || "un",
      fotoUrl: form.fotoUrl,
      ativo: form.ativo,
    };
    if (epi) await epiActions.atualizarEpi(epi.id, payload);
    else await epiActions.criarEpi(payload);
    toast.success(epi ? "EPI atualizado." : "EPI cadastrado.");
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#213368]">
            <ShieldCheck className="h-5 w-5 text-[#F37032]" /> {epi ? "Editar EPI" : "Novo EPI"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Nome *</Label>
            <Input
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex.: Capacete de segurança"
            />
          </div>
          <div>
            <Label>Nº do C.A.</Label>
            <Input
              value={form.ca}
              onChange={(e) => setForm({ ...form, ca: e.target.value })}
              placeholder="Certificado de Aprovação"
            />
          </div>
          <div>
            <Label>Categoria</Label>
            <Input
              value={form.categoria}
              onChange={(e) => setForm({ ...form, categoria: e.target.value })}
              placeholder="Ex.: Proteção da cabeça"
            />
          </div>
          <div>
            <Label>Fabricante</Label>
            <Input
              value={form.fabricante}
              onChange={(e) => setForm({ ...form, fabricante: e.target.value })}
            />
          </div>
          <div>
            <Label>Validade do C.A.</Label>
            <Input
              type="date"
              value={form.caValidade}
              onChange={(e) => setForm({ ...form, caValidade: e.target.value })}
            />
          </div>
          <div>
            <Label>Validade de uso (dias)</Label>
            <InputNumero
              valor={form.validadeDias}
              onChange={(v) => setForm({ ...form, validadeDias: v })}
              casas={0}
              placeholder="Ex.: 180"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Estoque</Label>
              <InputNumero
                valor={form.estoque}
                onChange={(v) => setForm({ ...form, estoque: v })}
                casas={0}
              />
            </div>
            <div>
              <Label>Unidade</Label>
              <Input
                value={form.unidade}
                onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                placeholder="un / par / cx"
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <Textarea
              rows={2}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
            />
          </div>

          <div className="md:col-span-2">
            <Label>Foto do EPI</Label>
            <div className="mt-1 flex items-center gap-3">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#e6e6ea] bg-[#F4F4F4]">
                {form.fotoUrl ? (
                  <img
                    src={form.fotoUrl}
                    alt="Foto do EPI"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fotoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={enviarFoto}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fotoRef.current?.click()}
                    disabled={enviandoFoto}
                  >
                    <Upload className="mr-1 h-4 w-4" />{" "}
                    {enviandoFoto ? "Enviando…" : form.fotoUrl ? "Trocar foto" : "Enviar foto"}
                  </Button>
                  {form.fotoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm({ ...form, fotoUrl: "" })}
                    >
                      <Trash2 className="mr-1 h-4 w-4 text-red-600" /> Remover
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  A foto aparece na tabela do termo de entrega.
                </p>
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <Label>Situação</Label>
            <Select
              value={form.ativo ? "ativo" : "inativo"}
              onValueChange={(v) => setForm({ ...form, ativo: v === "ativo" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={saving}
            className="bg-[#213368] text-white hover:bg-[#2a4185]"
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Formulário de Funcionário
// ============================================================
