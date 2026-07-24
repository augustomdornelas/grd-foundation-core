export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      categorias_equipamentos: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          ativo: boolean
          cidade: string | null
          colaborador_grd: boolean
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          nome: string
          observacoes: string | null
          telefone: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cidade?: string | null
          colaborador_grd?: boolean
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          telefone?: string | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cidade?: string | null
          colaborador_grd?: boolean
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          telefone?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      contatos: {
        Row: {
          created_at: string
          email: string
          id: string
          mensagem: string
          nome: string
          observacoes: string | null
          status: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          mensagem: string
          nome: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          mensagem?: string
          nome?: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      custos: {
        Row: {
          categoria: string | null
          created_at: string
          data: string | null
          descricao: string | null
          id: string
          projeto_id: string
          updated_at: string
          valor: number
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          data?: string | null
          descricao?: string | null
          id: string
          projeto_id: string
          updated_at?: string
          valor?: number
        }
        Update: {
          categoria?: string | null
          created_at?: string
          data?: string | null
          descricao?: string | null
          id?: string
          projeto_id?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "custos_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      emprestimos: {
        Row: {
          ativo: boolean
          cliente_id: string | null
          condicao_devolucao: string | null
          created_at: string
          custo_periodo: number
          custo_total: number
          data_devolucao_prevista: string
          data_devolucao_real: string | null
          data_inicio: string
          destino: string
          equipamento_id: string
          id: string
          numero_termo_devolucao: string | null
          observacoes: string | null
          observacoes_devolucao: string | null
          resp_entrega_cargo: string | null
          resp_entrega_nome: string | null
          resp_retirada_cargo: string | null
          resp_retirada_cpf: string | null
          resp_retirada_nome: string | null
          responsavel: string
          responsavel_cargo: string | null
          responsavel_cpf: string | null
          responsavel_rg: string | null
          unidade: string
        }
        Insert: {
          ativo?: boolean
          cliente_id?: string | null
          condicao_devolucao?: string | null
          created_at?: string
          custo_periodo?: number
          custo_total?: number
          data_devolucao_prevista: string
          data_devolucao_real?: string | null
          data_inicio: string
          destino?: string
          equipamento_id: string
          id: string
          numero_termo_devolucao?: string | null
          observacoes?: string | null
          observacoes_devolucao?: string | null
          resp_entrega_cargo?: string | null
          resp_entrega_nome?: string | null
          resp_retirada_cargo?: string | null
          resp_retirada_cpf?: string | null
          resp_retirada_nome?: string | null
          responsavel?: string
          responsavel_cargo?: string | null
          responsavel_cpf?: string | null
          responsavel_rg?: string | null
          unidade?: string
        }
        Update: {
          ativo?: boolean
          cliente_id?: string | null
          condicao_devolucao?: string | null
          created_at?: string
          custo_periodo?: number
          custo_total?: number
          data_devolucao_prevista?: string
          data_devolucao_real?: string | null
          data_inicio?: string
          destino?: string
          equipamento_id?: string
          id?: string
          numero_termo_devolucao?: string | null
          observacoes?: string | null
          observacoes_devolucao?: string | null
          resp_entrega_cargo?: string | null
          resp_entrega_nome?: string | null
          resp_retirada_cargo?: string | null
          resp_retirada_cpf?: string | null
          resp_retirada_nome?: string | null
          responsavel?: string
          responsavel_cargo?: string | null
          responsavel_cpf?: string | null
          responsavel_rg?: string | null
          unidade?: string
        }
        Relationships: [
          {
            foreignKeyName: "emprestimos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "vw_equipamento_payback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "vw_equipamentos_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "vw_equipamentos_ociosos"
            referencedColumns: ["id"]
          },
        ]
      }
      equipamentos: {
        Row: {
          catalogo_foto_url: string | null
          catalogo_nome: string | null
          categoria: string
          codigo: string
          created_at: string
          custo_periodo: number
          descricao: string
          exibir_catalogo: boolean
          foto_url: string | null
          id: string
          local_atual: string
          local_base: string
          nome: string
          responsavel_atual: string | null
          status: string
          unidade_periodo: string
          updated_at: string
          valor: number
        }
        Insert: {
          catalogo_foto_url?: string | null
          catalogo_nome?: string | null
          categoria?: string
          codigo: string
          created_at?: string
          custo_periodo?: number
          descricao?: string
          exibir_catalogo?: boolean
          foto_url?: string | null
          id: string
          local_atual?: string
          local_base?: string
          nome: string
          responsavel_atual?: string | null
          status?: string
          unidade_periodo?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          catalogo_foto_url?: string | null
          catalogo_nome?: string | null
          categoria?: string
          codigo?: string
          created_at?: string
          custo_periodo?: number
          descricao?: string
          exibir_catalogo?: boolean
          foto_url?: string | null
          id?: string
          local_atual?: string
          local_base?: string
          nome?: string
          responsavel_atual?: string | null
          status?: string
          unidade_periodo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      locais_equipamentos: {
        Row: {
          created_at: string
          id: string
          nome: string
          tipo: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          tipo?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          tipo?: string
        }
        Relationships: []
      }
      manutencoes: {
        Row: {
          aberta: boolean
          anexos: Json
          created_at: string
          custo: number
          custo_mao_obra: number
          custo_pecas: number
          data: string
          data_fim: string | null
          data_fim_prevista: string | null
          descricao: string
          equipamento_id: string
          id: string
          observacoes: string | null
          oficina: string
          status: string
          tipo: string
        }
        Insert: {
          aberta?: boolean
          anexos?: Json
          created_at?: string
          custo?: number
          custo_mao_obra?: number
          custo_pecas?: number
          data: string
          data_fim?: string | null
          data_fim_prevista?: string | null
          descricao?: string
          equipamento_id: string
          id: string
          observacoes?: string | null
          oficina?: string
          status?: string
          tipo?: string
        }
        Update: {
          aberta?: boolean
          anexos?: Json
          created_at?: string
          custo?: number
          custo_mao_obra?: number
          custo_pecas?: number
          data?: string
          data_fim?: string | null
          data_fim_prevista?: string | null
          descricao?: string
          equipamento_id?: string
          id?: string
          observacoes?: string | null
          oficina?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "manutencoes_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "vw_equipamento_payback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "vw_equipamentos_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "vw_equipamentos_ociosos"
            referencedColumns: ["id"]
          },
        ]
      }
      medicoes: {
        Row: {
          created_at: string
          data: string
          data_recebimento: string | null
          descricao: string
          id: string
          numero: string
          observacoes: string
          orcamento_id: string
          percentual_fisico: number
          status: string
          valor: number
        }
        Insert: {
          created_at?: string
          data?: string
          data_recebimento?: string | null
          descricao?: string
          id: string
          numero?: string
          observacoes?: string
          orcamento_id: string
          percentual_fisico?: number
          status?: string
          valor?: number
        }
        Update: {
          created_at?: string
          data?: string
          data_recebimento?: string | null
          descricao?: string
          id?: string
          numero?: string
          observacoes?: string
          orcamento_id?: string
          percentual_fisico?: number
          status?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "medicoes_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      notas_fiscais: {
        Row: {
          created_at: string
          data: string | null
          descricao: string | null
          fornecedor: string | null
          id: string
          numero: string | null
          projeto_id: string
          status: string
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          data?: string | null
          descricao?: string | null
          fornecedor?: string | null
          id: string
          numero?: string | null
          projeto_id: string
          status?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          created_at?: string
          data?: string | null
          descricao?: string | null
          fornecedor?: string | null
          id?: string
          numero?: string | null
          projeto_id?: string
          status?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "notas_fiscais_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      orcamentos: {
        Row: {
          anexo: string | null
          cliente: string
          cnpj: string
          created_at: string
          data_emissao: string | null
          descricao: string
          id: string
          notas: Json
          numero: string
          obra: string
          observacoes: string
          prazo_validade: string | null
          probabilidade: number
          responsavel: string
          status: string
          timeline: Json
          tipo_servico: string
          updated_at: string
          valor: number
        }
        Insert: {
          anexo?: string | null
          cliente?: string
          cnpj?: string
          created_at?: string
          data_emissao?: string | null
          descricao?: string
          id?: string
          notas?: Json
          numero?: string
          obra?: string
          observacoes?: string
          prazo_validade?: string | null
          probabilidade?: number
          responsavel?: string
          status?: string
          timeline?: Json
          tipo_servico?: string
          updated_at?: string
          valor?: number
        }
        Update: {
          anexo?: string | null
          cliente?: string
          cnpj?: string
          created_at?: string
          data_emissao?: string | null
          descricao?: string
          id?: string
          notas?: Json
          numero?: string
          obra?: string
          observacoes?: string
          prazo_validade?: string | null
          probabilidade?: number
          responsavel?: string
          status?: string
          timeline?: Json
          tipo_servico?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      portfolio: {
        Row: {
          ativo: boolean
          categoria: string | null
          created_at: string
          descricao: string | null
          foto_url: string | null
          id: string
          ordem: number
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          descricao?: string | null
          foto_url?: string | null
          id?: string
          ordem?: number
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          descricao?: string | null
          foto_url?: string | null
          id?: string
          ordem?: number
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      projetos: {
        Row: {
          cliente: string | null
          cliente_id: string | null
          created_at: string
          data_inicio: string | null
          descricao: string | null
          id: string
          local: string | null
          nome: string
          orcado: number
          orcamento_id: string | null
          prazo: string | null
          progresso: number
          responsavel: string | null
          status: string
          updated_at: string
          valor_contrato: number
        }
        Insert: {
          cliente?: string | null
          cliente_id?: string | null
          created_at?: string
          data_inicio?: string | null
          descricao?: string | null
          id: string
          local?: string | null
          nome: string
          orcado?: number
          orcamento_id?: string | null
          prazo?: string | null
          progresso?: number
          responsavel?: string | null
          status?: string
          updated_at?: string
          valor_contrato?: number
        }
        Update: {
          cliente?: string | null
          cliente_id?: string | null
          created_at?: string
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          local?: string | null
          nome?: string
          orcado?: number
          orcamento_id?: string | null
          prazo?: string | null
          progresso?: number
          responsavel?: string | null
          status?: string
          updated_at?: string
          valor_contrato?: number
        }
        Relationships: [
          {
            foreignKeyName: "projetos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projetos_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "orcamentos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      vw_destino_locacoes: {
        Row: {
          destino: string | null
          prazo_medio_dias: number | null
          primeira_locacao: string | null
          qtd_equipamentos: number | null
          qtd_locacoes: number | null
          receita: number | null
          ticket_medio: number | null
          total_dias: number | null
          ultima_movimentacao: string | null
        }
        Relationships: []
      }
      vw_equipamento_payback: {
        Row: {
          categoria: string | null
          classe: string | null
          codigo: string | null
          id: string | null
          nome: string | null
          payback_real_meses: number | null
          payback_teorico_meses: number | null
          pct_recuperado: number | null
          receita_historica: number | null
          valor: number | null
        }
        Relationships: []
      }
      vw_equipamentos_base: {
        Row: {
          categoria: string | null
          codigo: string | null
          custo_periodo: number | null
          diaria_eq: number | null
          equiv_mensal: number | null
          id: string | null
          locacoes_historico: number | null
          nome: string | null
          primeira_locacao: string | null
          receita_historica: number | null
          status: string | null
          unidade_periodo: string | null
          valor: number | null
        }
        Insert: {
          categoria?: string | null
          codigo?: string | null
          custo_periodo?: never
          diaria_eq?: never
          equiv_mensal?: never
          id?: string | null
          locacoes_historico?: never
          nome?: string | null
          primeira_locacao?: never
          receita_historica?: never
          status?: string | null
          unidade_periodo?: never
          valor?: never
        }
        Update: {
          categoria?: string | null
          codigo?: string | null
          custo_periodo?: never
          diaria_eq?: never
          equiv_mensal?: never
          id?: string | null
          locacoes_historico?: never
          nome?: string | null
          primeira_locacao?: never
          receita_historica?: never
          status?: string | null
          unidade_periodo?: never
          valor?: never
        }
        Relationships: []
      }
      vw_equipamentos_ociosos: {
        Row: {
          categoria: string | null
          codigo: string | null
          custo_oportunidade_mensal: number | null
          custo_periodo: number | null
          id: string | null
          nome: string | null
          primeira_locacao: string | null
          ultima_devolucao: string | null
          unidade_periodo: string | null
          valor: number | null
        }
        Insert: {
          categoria?: string | null
          codigo?: string | null
          custo_oportunidade_mensal?: never
          custo_periodo?: never
          id?: string | null
          nome?: string | null
          primeira_locacao?: never
          ultima_devolucao?: never
          unidade_periodo?: never
          valor?: never
        }
        Update: {
          categoria?: string | null
          codigo?: string | null
          custo_oportunidade_mensal?: never
          custo_periodo?: never
          id?: string | null
          nome?: string | null
          primeira_locacao?: never
          ultima_devolucao?: never
          unidade_periodo?: never
          valor?: never
        }
        Relationships: []
      }
      vw_locacoes_detalhe: {
        Row: {
          categoria: string | null
          custo_periodo: number | null
          data_devolucao_prevista: string | null
          data_devolucao_real: string | null
          data_inicio: string | null
          destino: string | null
          diaria_eq: number | null
          dias_locacao: number | null
          equipamento: string | null
          equipamento_id: string | null
          id: string | null
          receita_total: number | null
          responsavel: string | null
          status_locacao: string | null
          unidade: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emprestimos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "vw_equipamento_payback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "vw_equipamentos_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emprestimos_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "vw_equipamentos_ociosos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      fn_diaria_eq: {
        Args: { custo: number; unidade: string }
        Returns: number
      }
      fn_fator_mensal: { Args: { unidade: string }; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
