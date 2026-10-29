import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StatusBadge from '../componentes/StatusBadge'
import { formatarData, formatarMoeda, hojeISO } from '../lib/formatar'

type Tipo = { id: string; nome: string }
type Receita = {
  id: string
  descricao: string
  tipo_id: string
  comprador: string | null
  valor_total: number
  valor_recebido: number
  saldo_a_receber: number
  data_lancamento: string
  data_prevista: string | null
  status: string
}

const STATUS_ABERTOS = ['Pendente', 'Parcialmente recebido']
const LIMITE = 500

function somar(valores: number[]) {
  return valores.reduce((total, v) => total + Math.round(Number(v) * 100), 0) / 100
}

export default function ContasReceber() {
  const [tipos, setTipos] = useState<Tipo[]>([])
  const [linhas, setLinhas] = useState<Receita[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('abertas')
  const [filtroAno, setFiltroAno] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')

  const anoAtual = Number(hojeISO().slice(0, 4))
  const anos = Array.from({ length: 8 }, (_, i) => anoAtual + 1 - i)

  useEffect(() => {
    supabase
      .from('tipos_receita')
      .select('id, nome')
      .order('nome')
      .then(({ data }) => setTipos(data ?? []))
  }, [])

  useEffect(() => {
    let cancelado = false

    async function buscar() {
      setCarregando(true)
      setErro('')

      let consulta = supabase.from('v_contas_receber').select('*').limit(LIMITE)

      if (filtroStatus === 'abertas') {
        consulta = consulta
          .in('status', STATUS_ABERTOS)
          .order('data_prevista', { ascending: true, nullsFirst: false })
      } else {
        consulta = consulta.order('data_lancamento', { ascending: false })
        if (filtroStatus !== 'todos') consulta = consulta.eq('status', filtroStatus)
      }

      if (filtroAno !== 'todos') {
        consulta = consulta
          .gte('data_lancamento', `${filtroAno}-01-01`)
          .lte('data_lancamento', `${filtroAno}-12-31`)
      }
      if (filtroTipo) consulta = consulta.eq('tipo_id', filtroTipo)
      if (buscaAplicada) {
        const t = buscaAplicada.replace(/[%_,()]/g, ' ')
        consulta = consulta.or(`descricao.ilike.%${t}%,comprador.ilike.%${t}%`)
      }

      const { data, error } = await consulta
      if (cancelado) return

      if (error) {
        setErro('Não foi possível carregar as receitas. Verifique a internet e recarregue a página.')
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
  }, [filtroStatus, filtroAno, filtroTipo, buscaAplicada])

  const nomeTipo = useMemo(() => {
    const mapa: Record<string, string> = {}
    tipos.forEach((t) => (mapa[t.id] = t.nome))
    return mapa
  }, [tipos])

  function aplicarBusca(evento: FormEvent) {
    evento.preventDefault()
    setBuscaAplicada(busca.trim())
  }

  function limparFiltros() {
    setFiltroStatus('abertas')
    setFiltroAno('todos')
    setFiltroTipo('')
    setBusca('')
    setBuscaAplicada('')
  }

  const validas = linhas.filter((l) => l.status !== 'Cancelado')
  const totalLancado = somar(validas.map((l) => l.valor_total))
  const totalRecebido = somar(validas.map((l) => l.valor_recebido))
  const totalAReceber = somar(validas.map((l) => l.saldo_a_receber))

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Contas a receber</h1>
        <Link className="botao-link" to="/contas-receber/nova">
          + Nova receita
        </Link>
      </div>

      <form className="bloco filtros" onSubmit={aplicarBusca}>
        <div className="campo">
          <label htmlFor="r-status">Situação</label>
          <select id="r-status" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
            <option value="abertas">Em aberto (pendentes e parciais)</option>
            <option value="todos">Todas</option>
            <option value="Pendente">Pendentes</option>
            <option value="Parcialmente recebido">Parcialmente recebidas</option>
            <option value="Recebido">Recebidas</option>
            <option value="Cancelado">Canceladas</option>
          </select>
        </div>

        <div className="campo">
          <label htmlFor="r-ano">Ano do lançamento</label>
          <select id="r-ano" value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)}>
            <option value="todos">Todos os anos</option>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="r-tipo">Tipo de receita</label>
          <select id="r-tipo" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="r-busca">Procurar descrição ou comprador</label>
          <input
            id="r-busca"
            type="text"
            placeholder="Ex.: cooperativa"
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
        <p>Carregando receitas...</p>
      ) : linhas.length === 0 ? (
        <p className="bloco">Nenhuma receita encontrada com esses filtros.</p>
      ) : (
        <>
          <div className="totais">
            <div>
              <span className="rotulo">Receitas listadas</span>
              <strong>{linhas.length}</strong>
            </div>
            <div>
              <span className="rotulo">Total lançado (sem canceladas)</span>
              <strong>{formatarMoeda(totalLancado)}</strong>
            </div>
            <div>
              <span className="rotulo">Já recebido</span>
              <strong>{formatarMoeda(totalRecebido)}</strong>
            </div>
            <div>
              <span className="rotulo">Falta receber</span>
              <strong>{formatarMoeda(totalAReceber)}</strong>
            </div>
          </div>

          {linhas.length >= LIMITE && (
            <p className="nota">
              Mostrando as primeiras {LIMITE} receitas. Use os filtros para ver as demais.
            </p>
          )}

          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Recebimento previsto</th>
                  <th>Descrição</th>
                  <th>Comprador</th>
                  <th>Tipo</th>
                  <th className="num">Valor</th>
                  <th className="num">Falta receber</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td>{l.data_prevista ? formatarData(l.data_prevista) : 'Sem previsão'}</td>
                    <td>
                      <Link className="link-forte" to={`/contas-receber/${l.id}`}>
                        {l.descricao}
                      </Link>
                    </td>
                    <td>{l.comprador ?? '—'}</td>
                    <td>{nomeTipo[l.tipo_id] ?? '—'}</td>
                    <td className="num">{formatarMoeda(l.valor_total)}</td>
                    <td className="num">
                      {l.status === 'Cancelado' ? '—' : formatarMoeda(l.saldo_a_receber)}
                    </td>
                    <td>
                      <StatusBadge status={l.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}