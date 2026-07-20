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
        ]
      }
      equipamentos: {
        Row: {
          categoria: string
          codigo: string
          created_at: string
          custo_periodo: number
          descricao: string
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
          categoria?: string
          codigo: string
          created_at?: string
          custo_periodo?: number
          descricao?: string
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
          categoria?: string
          codigo?: string
          created_at?: string
          custo_periodo?: number
          descricao?: string
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
          prazo: string | null
          progresso: number
          responsavel: string | null
          status: string
          updated_at: string
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
          prazo?: string | null
          progresso?: number
          responsavel?: string | null
          status?: string
          updated_at?: string
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
          prazo?: string | null
          progresso?: number
          responsavel?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projetos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
