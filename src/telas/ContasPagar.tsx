import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StatusBadge from '../componentes/StatusBadge'
import {
  formatarData,
  formatarMoeda,
  formatarPrecoUnitario,
  formatarQuantidade,
  hojeISO,
} from '../lib/formatar'

type Categoria = { id: string; nome: string }
type Subcategoria = { id: string; nome: string; categoria_id: string }
type Fornecedor = { id: string; nome: string; ativo: boolean }
type Unidade = { codigo: string; simbolo: string }
type Conta = {
  id: string
  descricao: string
  categoria_id: string
  subcategoria_id: string | null
  fornecedor_id: string | null
  valor_original: number
  quantidade: number | null
  unidade_codigo: string | null
  preco_unitario: number | null
  data_vencimento: string
  saldo_principal: number
  status: string
}

const STATUS_ABERTOS = ['Pendente', 'Atrasada', 'Parcialmente paga']
const LIMITE = 500

function somar(valores: number[]) {
  return valores.reduce((total, v) => total + Math.round(Number(v) * 100), 0) / 100
}

export default function ContasPagar() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [linhas, setLinhas] = useState<Conta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [params] = useSearchParams()
  const pedida = params.get('situacao') ?? ''
  const situacaoInicial = ['Atrasada', 'Pendente', 'Parcialmente paga', 'Paga', 'Cancelada'].includes(pedida)
    ? pedida
    : 'abertas'
  const [filtroStatus, setFiltroStatus] = useState(situacaoInicial)
  const [filtroAno, setFiltroAno] = useState('todos')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroSubcategoria, setFiltroSubcategoria] = useState('')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')

  const anoAtual = Number(hojeISO().slice(0, 4))
  const anos = Array.from({ length: 8 }, (_, i) => anoAtual + 1 - i)

  useEffect(() => {
    supabase
      .from('categorias')
      .select('id, nome')
      .order('nome')
      .then(({ data }) => setCategorias(data ?? []))
    supabase
      .from('subcategorias')
      .select('id, nome, categoria_id')
      .order('nome')
      .then(({ data }) => setSubcategorias(data ?? []))
    supabase
      .from('fornecedores')
      .select('id, nome, ativo')
      .order('nome')
      .then(({ data }) => setFornecedores(data ?? []))
    supabase
      .from('unidades_medida')
      .select('codigo, simbolo')
      .then(({ data }) => setUnidades(data ?? []))
  }, [])

  useEffect(() => {
    let cancelado = false

    async function buscar() {
      setCarregando(true)
      setErro('')

      let consulta = supabase
        .from('v_contas_pagar')
        .select('*')
        .order('data_vencimento', { ascending: filtroStatus === 'abertas' })
        .limit(LIMITE)

      if (filtroStatus === 'abertas') consulta = consulta.in('status', STATUS_ABERTOS)
      else if (filtroStatus !== 'todos') consulta = consulta.eq('status', filtroStatus)

      if (filtroAno !== 'todos') {
        consulta = consulta
          .gte('data_vencimento', `${filtroAno}-01-01`)
          .lte('data_vencimento', `${filtroAno}-12-31`)
      }
      if (filtroCategoria) consulta = consulta.eq('categoria_id', filtroCategoria)
      if (filtroSubcategoria) consulta = consulta.eq('subcategoria_id', filtroSubcategoria)
      if (filtroFornecedor === 'sem') consulta = consulta.is('fornecedor_id', null)
      else if (filtroFornecedor) consulta = consulta.eq('fornecedor_id', filtroFornecedor)
      if (buscaAplicada) {
        consulta = consulta.ilike('descricao', `%${buscaAplicada.replace(/[%_]/g, ' ')}%`)
      }

      const { data, error } = await consulta
      if (cancelado) return

      if (error) {
        setErro('Não foi possível carregar as contas. Verifique a internet e recarregue a página.')
        setLinhas([])
      } else {
        setLinhas(data)
      }
      setCarregando(false)
    }

    buscar()
    return () => {
      cancelado = true
    }
  }, [filtroStatus, filtroAno, filtroCategoria, filtroSubcategoria, filtroFornecedor, buscaAplicada])

  const nomeCategoria = useMemo(() => {
    const mapa: Record<string, string> = {}
    categorias.forEach((c) => (mapa[c.id] = c.nome))
    return mapa
  }, [categorias])

  const nomeSubcategoria = useMemo(() => {
    const mapa: Record<string, string> = {}
    subcategorias.forEach((s) => (mapa[s.id] = s.nome))
    return mapa
  }, [subcategorias])

  const subsDaCategoria = subcategorias.filter((s) => s.categoria_id === filtroCategoria)

  const nomeFornecedor = useMemo(() => {
    const mapa: Record<string, string> = {}
    fornecedores.forEach((f) => (mapa[f.id] = f.nome))
    return mapa
  }, [fornecedores])

  const simboloUnidade = useMemo(() => {
    const mapa: Record<string, string> = {}
    unidades.forEach((u) => (mapa[u.codigo] = u.simbolo))
    return mapa
  }, [unidades])

  function aplicarBusca(evento: FormEvent) {
    evento.preventDefault()
    setBuscaAplicada(busca.trim())
  }

  function limparFiltros() {
    setFiltroStatus('abertas')
    setFiltroAno('todos')
    setFiltroCategoria('')
    setFiltroSubcategoria('')
    setFiltroFornecedor('')
    setBusca('')
    setBuscaAplicada('')
  }

  const validas = linhas.filter((l) => l.status !== 'Cancelada')
  const totalValor = somar(validas.map((l) => l.valor_original))
  const totalFalta = somar(
    linhas
      .filter((l) => l.status !== 'Cancelada' && l.status !== 'Paga')
      .map((l) => l.saldo_principal),
  )

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Contas a pagar</h1>
        <Link className="botao-link" to="/contas-pagar/nova">
          + Nova despesa
        </Link>
      </div>

      <form className="bloco filtros" onSubmit={aplicarBusca}>
        <div className="campo">
          <label htmlFor="f-status">Situação</label>
          <select id="f-status" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="abertas">Em aberto (pendentes, atrasadas e parciais)</option>
            <option value="todos">Todas</option>
            <option value="Atrasada">Atrasadas</option>
            <option value="Pendente">Pendentes</option>
            <option value="Parcialmente paga">Parcialmente pagas</option>
            <option value="Paga">Pagas</option>
            <option value="Cancelada">Canceladas</option>
          </select>
        </div>

        <div className="campo">
          <label htmlFor="f-ano">Ano do vencimento</label>
          <select id="f-ano" value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)}>
            <option value="todos">Todos os anos</option>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="f-cat">Categoria</label>
          <select
            id="f-cat"
            value={filtroCategoria}
            onChange={(e) => {
              setFiltroCategoria(e.target.value)
              setFiltroSubcategoria('')
            }}
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="f-sub">Subcategoria</label>
          <select
            id="f-sub"
            value={filtroSubcategoria}
            onChange={(e) => setFiltroSubcategoria(e.target.value)}
            disabled={!filtroCategoria}
          >
            <option value="">
              {filtroCategoria ? 'Todas as subcategorias' : 'Escolha uma categoria'}
            </option>
            {subsDaCategoria.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="f-forn">Fornecedor</label>
          <select
            id="f-forn"
            value={filtroFornecedor}
            onChange={(e) => setFiltroFornecedor(e.target.value)}
          >
            <option value="">Todos os fornecedores</option>
            <option value="sem">Contas sem fornecedor</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
                {f.ativo ? '' : ' (desativado)'}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="f-busca">Procurar na descrição</label>
          <input
            id="f-busca"
            type="text"
            placeholder="Ex.: diesel"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>

        <div className="acoes-filtro">
          <button className="botao-pequeno" type="submit">
            Procurar
          </button>
          <button className="botao-pequeno secundario" type="button" onClick={limparFiltros}>
            Limpar filtros
          </button>
        </div>
      </form>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {carregando ? (
        <p>Carregando contas...</p>
      ) : linhas.length === 0 ? (
        <p className="bloco">Nenhuma conta encontrada com esses filtros.</p>
      ) : (
        <>
          <div className="totais">
            <div>
              <span className="rotulo">Contas listadas</span>
              <strong>{linhas.length}</strong>
            </div>
            <div>
              <span className="rotulo">Valor das contas (sem canceladas)</span>
              <strong>{formatarMoeda(totalValor)}</strong>
            </div>
            <div>
              <span className="rotulo">Falta pagar (valor principal)</span>
              <strong>{formatarMoeda(totalFalta)}</strong>
            </div>
          </div>

          {linhas.length >= LIMITE && (
            <p className="nota">
              Mostrando as primeiras {LIMITE} contas. Use os filtros para ver as demais.
            </p>
          )}

          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Descrição</th>
                  <th>Fornecedor</th>
                  <th>Categoria</th>
                  <th className="num">Valor</th>
                  <th className="num">Falta pagar</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const simbolo = l.unidade_codigo ? (simboloUnidade[l.unidade_codigo] ?? '') : ''
                  return (
                    <tr key={l.id}>
                      <td>{formatarData(l.data_vencimento)}</td>
                      <td>
                        <Link className="link-forte" to={`/contas-pagar/${l.id}`}>
                          {l.descricao}
                        </Link>
                        {l.quantidade !== null && l.preco_unitario !== null && (
                          <span className="sub-nota">
                            {formatarQuantidade(l.quantidade)} {simbolo} ·{' '}
                            {formatarPrecoUnitario(l.preco_unitario)} por {simbolo}
                          </span>
                        )}
                      </td>
                      <td>{l.fornecedor_id ? (nomeFornecedor[l.fornecedor_id] ?? '—') : '—'}</td>
                      <td>
                        {nomeCategoria[l.categoria_id] ?? '—'}
                        {l.subcategoria_id && nomeSubcategoria[l.subcategoria_id] && (
                          <span
                            className="sub-nota sub-categoria"
                            title={nomeSubcategoria[l.subcategoria_id]}
                          >
                            {nomeSubcategoria[l.subcategoria_id]}
                          </span>
                        )}
                      </td>
                      <td className="num">{formatarMoeda(l.valor_original)}</td>
                      <td className="num">
                        {l.status === 'Cancelada' ? '—' : formatarMoeda(l.saldo_principal)}
                      </td>
                      <td>
                        <StatusBadge status={l.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}