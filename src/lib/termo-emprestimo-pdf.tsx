// PDF do Termo de Responsabilidade com @react-pdf/renderer
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

const NAVY = "#213368";
const ORANGE = "#F37032";
const GREY_BG = "#F4F4F4";
const TEXT_DARK = "#28282D";
const TEXT_MUTED = "#6E6E78";

export const LOGO_URL = "https://grupogrdbrasil.com.br/logo_grd.jpeg";

export interface TermoEmprestimoData {
  numero: string;
  emissao: string; // ISO
  equipamento: { nome: string; codigo: string; categoria: string; valor?: number };
  cliente?: string;
  destino: string;
  responsavel: string;
  responsavelCpf?: string;
  responsavelRg?: string;
  responsavelCargo?: string;
  dataInicio: string;
  dataDevolucaoPrevista: string;
  custoPeriodo: number;
  unidade: string;
  custoTotalPrevisto: number;
  observacoes?: string;
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
function brl(n: number | undefined) {
  return (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
const MESES_EXT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
function extenso(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `Agudos-SP, ${Number(d)} de ${MESES_EXT[Number(m) - 1]} de ${y}`;
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, color: TEXT_DARK, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { width: 70, height: 42, objectFit: "contain" },
  brandName: { fontSize: 16, fontFamily: "Helvetica-Bold", color: NAVY, textAlign: "right" },
  brandSub: { fontSize: 9, color: TEXT_MUTED, textAlign: "right", marginTop: 2 },
  brandAddr: { fontSize: 8, color: TEXT_MUTED, textAlign: "right", marginTop: 1 },
  orange: { height: 3, backgroundColor: ORANGE, marginVertical: 10 },
  title: {
    fontSize: 14, fontFamily: "Helvetica-Bold", color: NAVY, textAlign: "center",
    marginBottom: 4,
  },
  meta: { textAlign: "center", color: TEXT_MUTED, fontSize: 9, marginBottom: 10 },
  sectionTitle: {
    fontSize: 10, fontFamily: "Helvetica-Bold", color: NAVY, marginTop: 8, marginBottom: 4,
    textTransform: "uppercase",
  },
  boxGrey: {
    backgroundColor: GREY_BG, borderLeftWidth: 3, borderLeftColor: NAVY,
    padding: 8, borderRadius: 2,
  },
  boxWhite: {
    backgroundColor: "#FFFFFF", borderLeftWidth: 3, borderLeftColor: ORANGE,
    borderWidth: 0.5, borderColor: "#E5E5E9", padding: 8, borderRadius: 2,
  },
  boxPlain: { paddingVertical: 4 },
  row: { flexDirection: "row", marginBottom: 4 },
  cell: { flex: 1, paddingRight: 6 },
  label: { fontSize: 7, color: TEXT_MUTED, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  value: { fontSize: 10, color: TEXT_DARK, marginTop: 1 },
  body: { fontSize: 10, color: TEXT_DARK, lineHeight: 1.5, marginTop: 2 },
  bullet: { fontSize: 10, color: TEXT_DARK, lineHeight: 1.5, marginLeft: 8 },
  signRow: { flexDirection: "row", marginTop: 26, gap: 20 },
  signCol: { flex: 1 },
  signLine: { borderBottomWidth: 1, borderBottomColor: TEXT_DARK, marginBottom: 4, height: 24 },
  signLabel: { fontSize: 9, color: NAVY, fontFamily: "Helvetica-Bold", textAlign: "center" },
  signSub: { fontSize: 8.5, color: TEXT_DARK, textAlign: "center", marginTop: 2 },
  footer: {
    position: "absolute", left: 32, right: 32, bottom: 20,
    borderTopWidth: 0.5, borderTopColor: NAVY, paddingTop: 6,
    fontSize: 8, color: TEXT_MUTED, textAlign: "center",
  },
});

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <View style={styles.cell}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || "—"}</Text>
    </View>
  );
}

export function TermoEmprestimoDocument({ t }: { t: TermoEmprestimoData }) {
  const nome = (t.responsavel || "____________________").toUpperCase();
  const cpf = t.responsavelCpf || "________________";
  const rg = t.responsavelRg || "________________";
  const cargo = t.responsavelCargo || "________________";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Cabeçalho */}
        <View style={styles.headerRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image style={styles.logo} src={LOGO_URL} />
          <View>
            <Text style={styles.brandName}>GRUPO GRD</Text>
            <Text style={styles.brandSub}>Projetos e Construções</Text>
            <Text style={styles.brandAddr}>Av. José Antunes de Oliveira, 307 · Agudos-SP</Text>
            <Text style={styles.brandAddr}>(14) 3261-4194</Text>
          </View>
        </View>
        <View style={styles.orange} />

        <Text style={styles.title}>TERMO DE RESPONSABILIDADE DE EQUIPAMENTO</Text>
        <Text style={styles.meta}>Nº {t.numero} · Emissão: {fmtDate(t.emissao)}</Text>

        {/* Seção 1 — Equipamento */}
        <Text style={styles.sectionTitle}>1. Dados do equipamento</Text>
        <View style={styles.boxGrey}>
          <View style={styles.row}>
            <Field label="Nome" value={t.equipamento.nome} />
            <Field label="Código" value={t.equipamento.codigo} />
          </View>
          <View style={styles.row}>
            <Field label="Categoria" value={t.equipamento.categoria} />
            <Field label="Valor" value={brl(t.equipamento.valor)} />
          </View>
        </View>

        {/* Seção 2 — Responsável */}
        <Text style={styles.sectionTitle}>2. Dados do responsável</Text>
        <View style={styles.boxWhite}>
          <View style={styles.row}>
            <Field label="Nome completo" value={t.responsavel} />
            <Field label="Cliente / Empresa" value={t.cliente} />
          </View>
          <View style={styles.row}>
            <Field label="CPF" value={t.responsavelCpf} />
            <Field label="RG" value={t.responsavelRg} />
            <Field label="Cargo" value={t.responsavelCargo} />
          </View>
        </View>

        {/* Seção 3 — Empréstimo */}
        <Text style={styles.sectionTitle}>3. Dados do empréstimo</Text>
        <View style={styles.boxGrey}>
          <View style={styles.row}>
            <Field label="Destino / Obra" value={t.destino} />
            <Field label="Custo por período" value={`${brl(t.custoPeriodo)} / ${t.unidade}`} />
          </View>
          <View style={styles.row}>
            <Field label="Data de saída" value={fmtDate(t.dataInicio)} />
            <Field label="Devolução prevista" value={fmtDate(t.dataDevolucaoPrevista)} />
            <Field label="Custo total previsto" value={brl(t.custoTotalPrevisto)} />
          </View>
        </View>

        {/* Seção 4 — Termo */}
        <Text style={styles.sectionTitle}>4. Termo de responsabilidade</Text>
        <View style={styles.boxPlain}>
          <Text style={styles.body}>
            Eu, {nome}, portador do CPF {cpf} e RG {rg}, cargo {cargo}, declaro estar recebendo em regime de empréstimo o equipamento descrito acima, pertencente ao Grupo GRD Projetos e Construções, comprometendo-me a:
          </Text>
          <Text style={styles.bullet}>• Zelar pelo bom estado de conservação do equipamento;</Text>
          <Text style={styles.bullet}>• Utilizar exclusivamente para os fins relacionados à obra/destino indicado;</Text>
          <Text style={styles.bullet}>• Devolver até a data prevista em perfeito estado de funcionamento;</Text>
          <Text style={styles.bullet}>• Arcar com os custos de reparo em caso de dano, perda ou extravio;</Text>
          <Text style={styles.bullet}>• Comunicar imediatamente qualquer avaria ou ocorrência ao responsável da GRD.</Text>
          <Text style={styles.body}>
            Em caso de não devolução no prazo estipulado, fico ciente de que serão cobrados os dias adicionais conforme tabela de preços vigente, podendo a GRD tomar as medidas legais cabíveis.
          </Text>
          {t.observacoes ? (
            <Text style={[styles.body, { marginTop: 6, color: TEXT_MUTED }]}>
              Observações: {t.observacoes}
            </Text>
          ) : null}
        </View>

        {/* Seção 5 — Assinaturas */}
        <View style={styles.signRow}>
          <View style={styles.signCol}>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Responsável pela retirada</Text>
            <Text style={styles.signSub}>{t.responsavel || "—"}</Text>
            <Text style={styles.signSub}>CPF: {t.responsavelCpf || "—"}</Text>
          </View>
          <View style={styles.signCol}>
            <View style={styles.signLine} />
            <Text style={styles.signLabel}>Responsável pela entrega (GRD)</Text>
            <Text style={styles.signSub}>Nome: _______________________</Text>
            <Text style={styles.signSub}>Cargo: _______________________</Text>
          </View>
        </View>

        <Text style={styles.footer}>
          {extenso(t.emissao)}{"\n"}© 2026 Grupo GRD · grupogrdbrasil.com.br
        </Text>
      </Page>
    </Document>
  );
}

export function termoFileName(t: TermoEmprestimoData) {
  return `termo-emprestimo-${t.equipamento.codigo}-${t.emissao.slice(0, 10)}.pdf`;
}
