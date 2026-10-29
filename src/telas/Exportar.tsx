import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { baixarXlsx } from '../lib/planilha'
import type { Celula, Tipo } from '../lib/planilha'
import { hojeISO } from '../lib/formatar'
import DocumentosAno from '../componentes/DocumentosAno'
import BackupCompleto from '../componentes/BackupCompleto'

type Linha = Record<string, unknown>
type Col = {
  t: string
  c: string
  k?: 'data' | 'mes' | 'din' | 'pre' | 'qtd' | 'sim' | 'map'
  m?: Record<string, string>
}
type Mapa = Record<string, string>
type Mapas = { cat: Mapa; sub: Mapa; forn: Mapa; tipo: Mapa }
type Filtros = { de: string; ate: string; cat: string; forn: string }
type Dataset = {
  id: string
  nome: string
  desc: string
  filtros?: boolean
  cols: Col[]
  buscar: (f: Filtros, x: Mapas) => Promise<Linha[]>
}
type Item = { id: string; nome: string }

async function buscarTudo(
  pagina: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<Linha[]> {
  const tudo: Linha[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999)
    if (error) throw new Error('falha')
    const lote = (data ?? []) as Linha[]
    tudo.push(...lote)
    if (lote.length < 1000) break
  }
  return tudo
}

function ler(l: Linha, caminho: string): unknown {
  let v: unknown = l
  for (const p of caminho.split('.')) {
    if (v === null || typeof v !== 'object') return undefined
    v = (v as Linha)[p]
    if (Array.isArray(v)) v = v[0]
  }
  return v
}

const nome = (mapa: Mapa, id: unknown) => (typeof id === 'string' ? (mapa[id] ?? '') : '')

// Datas viram datas reais do Excel (UTC, para o fuso nunca mudar o dia).
function valor(v: unknown, c: Col): Celula {
  if (v === null || v === undefined || v === '') return null

  switch (c.k) {
    case 'data': {
      const [a, m, d] = String(v).slice(0, 10).split('-').map(Number)
      return new Date(Date.UTC(a, m - 1, d))
    }
    case 'mes': {
      const [a, m] = String(v).slice(0, 7).split('-').map(Number)
      return new Date(Date.UTC(a, m - 1, 1))
    }
    case 'din':
    case 'pre':
    case 'qtd': {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    case 'sim':
      return v ? 'Sim' : 'Não'
    case 'map':
      return c.m?.[String(v)] ?? String(v)
    default:
      return String(v)
  }
}

const tipoDe = (c: Col): Tipo => (c.k && c.k !== 'map' ? c.k : 'texto')

const MOD = { diaria: 'Diária', empreita: 'Empreita (por saco)' }
const TIPO_ITEM = {
  hora_extra: 'Hora extra',
  desconto: 'Desconto',
  adiantamento: 'Adiantamento',
}

const DATASETS: Dataset[] = [
  {
    id: 'extrato',
    nome: 'Extrato de movimentações',
    desc: 'Todo o dinheiro que entrou e saiu, em ordem de data (recebimentos, pagamentos de contas, pagamentos de funcionários e adiantamentos). O período filtra pela data da movimentação.',
    cols: [
      { t: 'Data', c: 'data', k: 'data' },
      { t: 'Movimento', c: 'tipo' },
      { t: 'Descrição', c: 'desc' },
      { t: 'Categoria ou tipo', c: 'classe' },
      { t: 'Subcategoria', c: 'subcat' },
      { t: 'Fornecedor, pessoa ou comprador', c: 'parte' },
      { t: 'Forma de pagamento', c: 'forma' },
      { t: 'Entrada (R$)', c: 'entrada', k: 'din' },
      { t: 'Saída (R$)', c: 'saida', k: 'din' },
    ],
    buscar: async (f, x) => {
      const [r, p, h, a] = await Promise.all([
        buscarTudo((i, j) => {
          let q = supabase
            .from('recebimentos')
            .select('*, contas_receber(descricao, comprador, tipo_id)')
            .order('id')
          if (f.de) q = q.gte('data_recebimento', f.de)
          if (f.ate) q = q.lte('data_recebimento', f.ate)
          return q.range(i, j)
        }),
        buscarTudo((i, j) => {
          let q = supabase
            .from('pagamentos')
            .select('*, contas_pagar(descricao, categoria_id, subcategoria_id, fornecedor_id)')
            .order('id')
          if (f.de) q = q.gte('data_pagamento', f.de)
          if (f.ate) q = q.lte('data_pagamento', f.ate)
          return q.range(i, j)
        }),
        buscarTudo((i, j) => {
          let q = supabase
            .from('pagamentos_rh')
            .select(
              '*, folhas(competencia, funcionarios(nome)), servicos_temp(descricao, funcionarios(nome))',
            )
            .order('id')
          if (f.de) q = q.gte('data_pagamento', f.de)
          if (f.ate) q = q.lte('data_pagamento', f.ate)
          return q.range(i, j)
        }),
        buscarTudo((i, j) => {
          let q = supabase
            .from('folha_itens')
            .select('*, folhas!inner(cancelada, competencia, funcionarios(nome))')
            .eq('tipo', 'adiantamento')
            .eq('folhas.cancelada', false)
            .order('id')
          if (f.de) q = q.gte('data', f.de)
          if (f.ate) q = q.lte('data', f.ate)
          return q.range(i, j)
        }),
      ])

      const linhas: Linha[] = []

      for (const l of r) {
        linhas.push({
          data: l.data_recebimento,
          tipo: 'Recebimento',
          desc: ler(l, 'contas_receber.descricao'),
          classe: nome(x.tipo, ler(l, 'contas_receber.tipo_id')),
          parte: ler(l, 'contas_receber.comprador'),
          entrada: l.valor,
        })
      }

      for (const l of p) {
        linhas.push({
          data: l.data_pagamento,
          tipo: 'Pagamento de conta',
          desc: ler(l, 'contas_pagar.descricao'),
          classe: nome(x.cat, ler(l, 'contas_pagar.categoria_id')),
          subcat: nome(x.sub, ler(l, 'contas_pagar.subcategoria_id')),
          parte: nome(x.forn, ler(l, 'contas_pagar.fornecedor_id')),
          forma: l.forma_pagamento,
          saida: l.valor_pago,
        })
      }

      for (const l of h) {
        const folha = ler(l, 'folhas.funcionarios.nome')
        const mes = ler(l, 'folhas.competencia')

        linhas.push({
          data: l.data_pagamento,
          tipo: folha ? 'Pagamento de funcionário (folha)' : 'Pagamento de temporário',
          desc: folha
            ? `Folha ${String(mes).slice(5, 7)}/${String(mes).slice(0, 4)}`
            : ler(l, 'servicos_temp.descricao'),
          classe: folha ? 'Funcionários fixos' : 'Funcionários temporários',
          parte: folha ?? ler(l, 'servicos_temp.funcionarios.nome'),
          forma: l.forma_pagamento,
          saida: l.valor,
        })
      }

      for (const l of a) {
        const mes = ler(l, 'folhas.competencia')

        linhas.push({
          data: l.data,
          tipo: 'Adiantamento',
          desc:
            l.descricao ??
            `Adiantamento da folha ${String(mes).slice(5, 7)}/${String(mes).slice(0, 4)}`,
          classe: 'Funcionários fixos',
          parte: ler(l, 'folhas.funcionarios.nome'),
          saida: l.valor,
        })
      }

      return linhas.sort((u, v) => String(u.data).localeCompare(String(v.data)))
    },
  },
  {
    id: 'contas-a-pagar',
    nome: 'Contas a pagar',
    desc: 'Todas as contas, com o que já foi pago e o que falta. O período filtra pela data de vencimento.',
    filtros: true,
    cols: [
      { t: 'Vencimento', c: 'data_vencimento', k: 'data' },
      { t: 'Descrição', c: 'descricao' },
      { t: 'Categoria', c: '_cat' },
      { t: 'Subcategoria', c: '_sub' },
      { t: 'Fornecedor', c: '_forn' },
      { t: 'Valor original (R$)', c: 'valor_original', k: 'din' },
      { t: 'Quantidade', c: 'quantidade', k: 'qtd' },
      { t: 'Unidade', c: 'unidade_codigo' },
      { t: 'Preço por unidade (R$)', c: 'preco_unitario', k: 'pre' },
      { t: 'Principal pago (R$)', c: 'principal_pago', k: 'din' },
      { t: 'Juros pagos (R$)', c: 'juros_pagos', k: 'din' },
      { t: 'Multas pagas (R$)', c: 'multas_pagas', k: 'din' },
      { t: 'Ajustes (R$)', c: 'ajustes', k: 'din' },
      { t: 'Total pago (R$)', c: 'total_pago', k: 'din' },
      { t: 'Falta pagar (R$)', c: 'saldo_principal', k: 'din' },
      { t: 'Situação', c: 'status' },
      { t: 'Data do lançamento', c: 'data_lancamento', k: 'data' },
      { t: 'Mês de referência', c: 'competencia', k: 'mes' },
      { t: 'Forma prevista', c: 'forma_pagamento' },
      { t: 'Observações', c: 'observacoes' },
    ],
    buscar: async (f, x) => {
      const r = await buscarTudo((i, j) => {
        let q = supabase.from('v_contas_pagar').select('*').order('data_vencimento').order('id')
        if (f.de) q = q.gte('data_vencimento', f.de)
        if (f.ate) q = q.lte('data_vencimento', f.ate)
        if (f.cat) q = q.eq('categoria_id', f.cat)
        if (f.forn) q = q.eq('fornecedor_id', f.forn)
        return q.range(i, j)
      })

      return r.map((l) => ({
        ...l,
        _cat: nome(x.cat, l.categoria_id),
        _sub: nome(x.sub, l.subcategoria_id),
        _forn: nome(x.forn, l.fornecedor_id),
      }))
    },
  },
  {
    id: 'pagamentos-de-contas',
    nome: 'Pagamentos de contas',
    desc: 'Cada pagamento feito, com juros, multa e ajuste. O período filtra pela data do pagamento.',
    filtros: true,
    cols: [
      { t: 'Data do pagamento', c: 'data_pagamento', k: 'data' },
      { t: 'Conta', c: 'contas_pagar.descricao' },
      { t: 'Categoria', c: '_cat' },
      { t: 'Subcategoria', c: '_sub' },
      { t: 'Fornecedor', c: '_forn' },
      { t: 'Principal (R$)', c: 'valor_principal', k: 'din' },
      { t: 'Juros (R$)', c: 'juros', k: 'din' },
      { t: 'Multa (R$)', c: 'multa', k: 'din' },
      { t: 'Valor calculado (R$)', c: 'valor_calculado', k: 'din' },
      { t: 'Valor pago (R$)', c: 'valor_pago', k: 'din' },
      { t: 'Ajuste (R$)', c: 'ajuste', k: 'din' },
      { t: 'Justificativa do ajuste', c: 'justificativa_ajuste' },
      { t: 'Forma de pagamento', c: 'forma_pagamento' },
      { t: 'Observações', c: 'observacoes' },
    ],
    buscar: async (f, x) => {
      const r = await buscarTudo((i, j) => {
        let q = supabase
          .from('pagamentos')
          .select('*, contas_pagar!inner(descricao, categoria_id, subcategoria_id, fornecedor_id)')
          .order('data_pagamento')
          .order('id')
        if (f.de) q = q.gte('data_pagamento', f.de)
        if (f.ate) q = q.lte('data_pagamento', f.ate)
        if (f.cat) q = q.eq('contas_pagar.categoria_id', f.cat)
        if (f.forn) q = q.eq('contas_pagar.fornecedor_id', f.forn)
        return q.range(i, j)
      })

      return r.map((l) => ({
        ...l,
        _cat: nome(x.cat, ler(l, 'contas_pagar.categoria_id')),
        _sub: nome(x.sub, ler(l, 'contas_pagar.subcategoria_id')),
        _forn: nome(x.forn, ler(l, 'contas_pagar.fornecedor_id')),
      }))
    },
  },
  {
    id: 'receitas',
    nome: 'Receitas',
    desc: 'Todas as receitas, com o que já foi recebido e o que falta. O período filtra pela data do lançamento.',
    cols: [
      { t: 'Data do lançamento', c: 'data_lancamento', k: 'data' },
      { t: 'Recebimento previsto', c: 'data_prevista', k: 'data' },
      { t: 'Descrição', c: 'descricao' },
      { t: 'Tipo', c: '_tipo' },
      { t: 'Comprador', c: 'comprador' },
      { t: 'Valor total (R$)', c: 'valor_total', k: 'din' },
      { t: 'Recebido (R$)', c: 'valor_recebido', k: 'din' },
      { t: 'Falta receber (R$)', c: 'saldo_a_receber', k: 'din' },
      { t: 'Situação', c: 'status' },
      { t: 'Mês de referência', c: 'competencia', k: 'mes' },
      { t: 'Observações', c: 'observacoes' },
    ],
    buscar: async (f, x) => {
      const r = await buscarTudo((i, j) => {
        let q = supabase.from('v_contas_receber').select('*').order('data_lancamento').order('id')
        if (f.de) q = q.gte('data_lancamento', f.de)
        if (f.ate) q = q.lte('data_lancamento', f.ate)
        return q.range(i, j)
      })

      return r.map((l) => ({ ...l, _tipo: nome(x.tipo, l.tipo_id) }))
    },
  },
  {
    id: 'recebimentos',
    nome: 'Recebimentos',
    desc: 'Cada valor recebido. O período filtra pela data do recebimento.',
    cols: [
      { t: 'Data do recebimento', c: 'data_recebimento', k: 'data' },
      { t: 'Receita', c: 'contas_receber.descricao' },
      { t: 'Comprador', c: 'contas_receber.comprador' },
      { t: 'Tipo', c: '_tipo' },
      { t: 'Valor recebido (R$)', c: 'valor', k: 'din' },
      { t: 'Observações', c: 'observacoes' },
    ],
    buscar: async (f, x) => {
      const r = await buscarTudo((i, j) => {
        let q = supabase
          .from('recebimentos')
          .select('*, contas_receber(descricao, comprador, tipo_id)')
          .order('data_recebimento')
          .order('id')
        if (f.de) q = q.gte('data_recebimento', f.de)
        if (f.ate) q = q.lte('data_recebimento', f.ate)
        return q.range(i, j)
      })

      return r.map((l) => ({ ...l, _tipo: nome(x.tipo, ler(l, 'contas_receber.tipo_id')) }))
    },
  },
  {
    id: 'folhas',
    nome: 'Folhas de funcionários fixos',
    desc: 'Uma linha por funcionário e mês. O período filtra pelo mês de referência.',
    cols: [
      { t: 'Mês de referência', c: 'competencia', k: 'mes' },
      { t: 'Funcionário', c: 'funcionario_nome' },
      { t: 'Salário (R$)', c: 'salario', k: 'din' },
      { t: 'Horas extras (R$)', c: 'horas_extras_valor', k: 'din' },
      { t: 'Descontos (R$)', c: 'descontos_valor', k: 'din' },
      { t: 'Adiantamentos (R$)', c: 'adiantamentos_valor', k: 'din' },
      { t: 'Valor líquido (R$)', c: 'valor_liquido', k: 'din' },
      { t: 'Já pago (R$)', c: 'total_pago', k: 'din' },
      { t: 'Falta pagar (R$)', c: 'saldo_a_pagar', k: 'din' },
      { t: 'Vencimento', c: 'data_vencimento', k: 'data' },
      { t: 'Situação', c: 'status' },
    ],
    buscar: (f) =>
      buscarTudo((i, j) => {
        let q = supabase.from('v_folhas').select('*').order('competencia').order('id')
        if (f.de) q = q.gte('competencia', f.de)
        if (f.ate) q = q.lte('competencia', f.ate)
        return q.range(i, j)
      }),
  },
  {
    id: 'lancamentos-da-folha',
    nome: 'Horas extras, descontos e adiantamentos',
    desc: 'Cada lançamento das folhas, com a descrição. O período filtra pela data do lançamento.',
    cols: [
      { t: 'Data', c: 'data', k: 'data' },
      { t: 'Funcionário', c: 'folhas.funcionarios.nome' },
      { t: 'Mês da folha', c: 'folhas.competencia', k: 'mes' },
      { t: 'Tipo', c: 'tipo', k: 'map', m: TIPO_ITEM },
      { t: 'Horas', c: 'horas', k: 'qtd' },
      { t: 'Valor da hora (R$)', c: 'valor_hora', k: 'din' },
      { t: 'Valor (R$)', c: 'valor', k: 'din' },
      { t: 'Descrição', c: 'descricao' },
      { t: 'Folha cancelada', c: 'folhas.cancelada', k: 'sim' },
    ],
    buscar: (f) =>
      buscarTudo((i, j) => {
        let q = supabase
          .from('folha_itens')
          .select('*, folhas!inner(cancelada, competencia, funcionarios(nome))')
          .order('data')
          .order('id')
        if (f.de) q = q.gte('data', f.de)
        if (f.ate) q = q.lte('data', f.ate)
        return q.range(i, j)
      }),
  },
  {
    id: 'temporarios',
    nome: 'Temporários (serviços)',
    desc: 'Um lançamento por serviço, com total e o que falta pagar. O período filtra pela data em que o lançamento foi criado.',
    cols: [
      { t: 'Funcionário', c: 'funcionario_nome' },
      { t: 'Forma', c: 'modalidade', k: 'map', m: MOD },
      { t: 'Descrição', c: 'descricao' },
      { t: 'Dias trabalhados', c: 'qtd_dias', k: 'qtd' },
      { t: 'Quantidade total', c: 'quantidade_total', k: 'qtd' },
      { t: 'Valor unitário (R$)', c: 'valor_unitario', k: 'din' },
      { t: 'Total a pagar (R$)', c: 'total_a_pagar', k: 'din' },
      { t: 'Já pago (R$)', c: 'total_pago', k: 'din' },
      { t: 'Falta pagar (R$)', c: 'saldo_a_pagar', k: 'din' },
      { t: 'Pagar até', c: 'data_vencimento', k: 'data' },
      { t: 'Situação', c: 'status' },
    ],
    buscar: (f) =>
      buscarTudo((i, j) => {
        let q = supabase.from('v_servicos_temp').select('*').order('criado_em').order('id')
        if (f.de) q = q.gte('criado_em', `${f.de}T00:00:00-03:00`)
        if (f.ate) q = q.lte('criado_em', `${f.ate}T23:59:59.999-03:00`)
        return q.range(i, j)
      }),
  },
  {
    id: 'dias-trabalhados',
    nome: 'Dias trabalhados (temporários)',
    desc: 'Cada dia marcado no calendário, com a quantidade de sacos nas empreitadas. O período filtra pela data do dia trabalhado.',
    cols: [
      { t: 'Data', c: 'data', k: 'data' },
      { t: 'Funcionário', c: 'servicos_temp.funcionarios.nome' },
      { t: 'Serviço', c: 'servicos_temp.descricao' },
      { t: 'Forma', c: 'servicos_temp.modalidade', k: 'map', m: MOD },
      { t: 'Quantidade (dia = 1, ou sacos)', c: 'quantidade', k: 'qtd' },
      { t: 'Valor unitário (R$)', c: 'servicos_temp.valor_unitario', k: 'din' },
      { t: 'Serviço cancelado', c: 'servicos_temp.cancelada', k: 'sim' },
    ],
    buscar: (f) =>
      buscarTudo((i, j) => {
        let q = supabase
          .from('servico_dias')
          .select(
            '*, servicos_temp!inner(descricao, modalidade, valor_unitario, cancelada, funcionarios(nome))',
          )
          .order('data')
          .order('id')
        if (f.de) q = q.gte('data', f.de)
        if (f.ate) q = q.lte('data', f.ate)
        return q.range(i, j)
      }),
  },
  {
    id: 'pagamentos-de-funcionarios',
    nome: 'Pagamentos de funcionários',
    desc: 'Pagamentos de folhas e de temporários (sem os adiantamentos, que estão no extrato). O período filtra pela data do pagamento.',
    cols: [
      { t: 'Data do pagamento', c: 'data_pagamento', k: 'data' },
      { t: 'Funcionário', c: '_func' },
      { t: 'Origem', c: '_origem' },
      { t: 'Referência', c: '_ref' },
      { t: 'Valor (R$)', c: 'valor', k: 'din' },
      { t: 'Forma de pagamento', c: 'forma_pagamento' },
      { t: 'Observações', c: 'observacoes' },
    ],
    buscar: async (f) => {
      const r = await buscarTudo((i, j) => {
        let q = supabase
          .from('pagamentos_rh')
          .select(
            '*, folhas(competencia, funcionarios(nome)), servicos_temp(descricao, funcionarios(nome))',
          )
          .order('data_pagamento')
          .order('id')
        if (f.de) q = q.gte('data_pagamento', f.de)
        if (f.ate) q = q.lte('data_pagamento', f.ate)
        return q.range(i, j)
      })

      return r.map((l) => {
        const folha = ler(l, 'folhas.funcionarios.nome')
        const mes = String(ler(l, 'folhas.competencia') ?? '')

        return {
          ...l,
          _func: folha ?? ler(l, 'servicos_temp.funcionarios.nome'),
          _origem: folha ? 'Folha mensal' : 'Temporário',
          _ref: folha ? `${mes.slice(5, 7)}/${mes.slice(0, 4)}` : ler(l, 'servicos_temp.descricao'),
        }
      })
    },
  },
]

function mapa(lista: Item[]): Mapa {
  const m: Mapa = {}
  lista.forEach((i) => (m[i.id] = i.nome))
  return m
}

export default function Exportar() {
  const ano = hojeISO().slice(0, 4)
  const [id, setId] = useState('extrato')
  const [f, setF] = useState<Filtros>({ de: `${ano}-01-01`, ate: `${ano}-12-31`, cat: '', forn: '' })
  const [cats, setCats] = useState<Item[]>([])
  const [forns, setForns] = useState<Item[]>([])
  const [tipos, setTipos] = useState<Item[]>([])
  const [subs, setSubs] = useState<Item[]>([])
  const [pronto, setPronto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('categorias').select('id, nome').order('nome'),
      supabase.from('fornecedores').select('id, nome').order('nome'),
      supabase.from('tipos_receita').select('id, nome').order('nome'),
      supabase.from('subcategorias').select('id, nome'),
    ]).then(([c, fo, t, s]) => {
      if (c.error || fo.error || t.error || s.error) {
        setErro('Não foi possível carregar os cadastros. Recarregue a página.')
        return
      }
      setCats(c.data)
      setForns(fo.data)
      setTipos(t.data)
      setSubs(s.data)
      setPronto(true)
    })
  }, [])

  const ds = DATASETS.find((d) => d.id === id) ?? DATASETS[0]

  function periodo(de: string, ate: string) {
    setF({ ...f, de, ate })
  }

  async function baixar() {
    setErro('')
    setAviso('')

    if (f.de && f.ate && f.de > f.ate) {
      setErro('A data inicial não pode ser depois da data final.')
      return
    }

    setOcupado(true)

    try {
      const linhas = await ds.buscar(f, {
        cat: mapa(cats),
        sub: mapa(subs),
        forn: mapa(forns),
        tipo: mapa(tipos),
      })

      if (linhas.length === 0) {
        setAviso('Não há registros neste período e com estes filtros. Nenhum arquivo foi gerado.')
        return
      }

      await baixarXlsx(
        `${ds.id}_${f.de || 'inicio'}_a_${f.ate || 'hoje'}.xlsx`,
        ds.nome,
        ds.cols.map((c) => ({ titulo: c.t, tipo: tipoDe(c) })),
        linhas.map((l) => ds.cols.map((c) => valor(ler(l, c.c), c))),
      )

      setAviso(`${linhas.length} linhas exportadas. O arquivo foi para a pasta de downloads.`)
    } catch {
      setErro('Não foi possível gerar a planilha. Verifique a internet e tente de novo.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <h2>Exportar para Excel</h2>

      <p>
        Escolha o que exportar e o período. O arquivo é gerado em Excel (.xlsx), com tabela formatada,
        filtros nos títulos, datas e valores no formato brasileiro.
      </p>

      <section className="bloco">
        <div className="grade">
          <div className="campo largo">
            <label htmlFor="ex-tipo">O que exportar</label>
            <select id="ex-tipo" value={id} onChange={(e) => setId(e.target.value)}>
              {DATASETS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome}
                </option>
              ))}
            </select>
            <span className="dica">{ds.desc}</span>
          </div>

          <div className="campo">
            <label htmlFor="ex-de">De</label>
            <input
              id="ex-de"
              type="date"
              value={f.de}
              onChange={(e) => setF({ ...f, de: e.target.value })}
            />
          </div>

          <div className="campo">
            <label htmlFor="ex-ate">Até</label>
            <input
              id="ex-ate"
              type="date"
              value={f.ate}
              onChange={(e) => setF({ ...f, ate: e.target.value })}
            />
          </div>

          <div className="campo largo">
            <div className="linha">
              <button
                className="botao-pequeno secundario"
                type="button"
                onClick={() => periodo(`${ano}-01-01`, `${ano}-12-31`)}
              >
                Este ano
              </button>

              <button
                className="botao-pequeno secundario"
                type="button"
                onClick={() => periodo(`${Number(ano) - 1}-01-01`, `${Number(ano) - 1}-12-31`)}
              >
                Ano passado
              </button>

              <button
                className="botao-pequeno secundario"
                type="button"
                onClick={() => periodo('', '')}
              >
                Todo o período
              </button>
            </div>
          </div>

          {ds.filtros && (
            <>
              <div className="campo">
                <label htmlFor="ex-cat">Categoria</label>
                <select id="ex-cat" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
                  <option value="">Todas as categorias</option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo">
                <label htmlFor="ex-forn">Fornecedor</label>
                <select id="ex-forn" value={f.forn} onChange={(e) => setF({ ...f, forn: e.target.value })}>
                  <option value="">Todos os fornecedores</option>
                  {forns.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>

        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}

        {aviso && (
          <p className="aviso" role="status">
            {aviso}
          </p>
        )}

        <button className="botao" type="button" disabled={!pronto || ocupado} onClick={baixar}>
          {ocupado ? 'Gerando planilha...' : 'Baixar planilha (Excel)'}
        </button>

        <p className="nota">
          Para abrir, dê dois cliques no arquivo baixado. Os valores são números, então dá para somar
          e fazer contas no Excel.
        </p>
            </section>

      <DocumentosAno />

      <BackupCompleto />
    </>
  )
}