import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StatusBadge from '../componentes/StatusBadge'
import { formatarData, formatarMes, formatarMoeda, hojeISO } from '../lib/formatar'

type Fixo = { id: string; nome: string }
type Folha = {
  id: string
  funcionario_id: string
  funcionario_nome: string
  competencia: string
  data_vencimento: string
  valor_liquido: number
  total_pago: number
  saldo_a_pagar: number
  status: string
}

const STATUS_ABERTOS = ['Pendente', 'Atrasada', 'Parcialmente paga']
const LIMITE = 500

function somar(valores: number[]) {
  return valores.reduce((total, v) => total + Math.round(Number(v) * 100), 0) / 100
}

export default function FolhaMensal() {
  const [fixos, setFixos] = useState<Fixo[]>([])
  const [linhas, setLinhas] = useState<Folha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('abertas')
  const [filtroAno, setFiltroAno] = useState('todos')
  const [filtroFunc, setFiltroFunc] = useState('')

  const anoAtual = Number(hojeISO().slice(0, 4))
  const anos = Array.from({ length: 8 }, (_, i) => anoAtual + 1 - i)

  useEffect(() => {
    supabase
      .from('funcionarios')
      .select('id, nome')
      .eq('tipo', 'fixo')
      .order('nome')
      .then(({ data }) => setFixos(data ?? []))
  }, [])

  useEffect(() => {
    let cancelado = false

    async function buscar() {
      setCarregando(true)
      setErro('')

      let consulta = supabase.from('v_folhas').select('*').limit(LIMITE)

      if (filtroStatus === 'abertas') {
        consulta = consulta
          .in('status', STATUS_ABERTOS)
          .order('data_vencimento', { ascending: true })
      } else {
        consulta = consulta.order('competencia', { ascending: false })
        if (filtroStatus !== 'todos') consulta = consulta.eq('status', filtroStatus)
      }

      if (filtroAno !== 'todos') {
        consulta = consulta
          .gte('competencia', `${filtroAno}-01-01`)
          .lte('competencia', `${filtroAno}-12-31`)
      }
      if (filtroFunc) consulta = consulta.eq('funcionario_id', filtroFunc)

      const { data, error } = await consulta
      if (cancelado) return

      if (error) {
        setErro('Não foi possível carregar as folhas. Verifique a internet e recarregue a página.')
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
  }, [filtroStatus, filtroAno, filtroFunc])

  function limparFiltros() {
    setFiltroStatus('abertas')
    setFiltroAno('todos')
    setFiltroFunc('')
  }

  const validas = linhas.filter((l) => l.status !== 'Cancelada')
  const totalLiquido = somar(validas.map((l) => l.valor_liquido))
  const totalPago = somar(validas.map((l) => l.total_pago))
  const totalFalta = somar(validas.map((l) => l.saldo_a_pagar))

  return (
    <>
      <div className="cabecalho-pagina">
        <h2>Folha mensal</h2>
        <Link className="botao-link" to="/funcionarios/folha/nova">
          + Nova folha
        </Link>
      </div>
      <p>
        Uma folha por funcionário fixo em cada mês, com salário, horas extras, descontos e
        adiantamentos. O valor líquido é o que ainda será pago ao funcionário.
      </p>

      <section className="bloco filtros">
        <div className="campo">
          <label htmlFor="fm-status">Situação</label>
          <select id="fm-status" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
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
          <label htmlFor="fm-ano">Ano do mês de referência</label>
          <select id="fm-ano" value={filtroAno} onChange={(e) => setFiltroAno(e.target.value)}>
            <option value="todos">Todos os anos</option>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="fm-func">Funcionário</label>
          <select id="fm-func" value={filtroFunc} onChange={(e) => setFiltroFunc(e.target.value)}>
            <option value="">Todos os funcionários</option>
            {fixos.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="acoes-filtro">
          <button className="botao-pequeno secundario" type="button" onClick={limparFiltros}>
            Limpar filtros
          </button>
        </div>
      </section>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {carregando ? (
        <p>Carregando folhas...</p>
      ) : linhas.length === 0 ? (
        <p className="bloco">Nenhuma folha encontrada com esses filtros.</p>
      ) : (
        <>
          <div className="totais">
            <div>
              <span className="rotulo">Folhas listadas</span>
              <strong>{linhas.length}</strong>
            </div>
            <div>
              <span className="rotulo">Valor líquido (sem canceladas)</span>
              <strong>{formatarMoeda(totalLiquido)}</strong>
            </div>
            <div>
              <span className="rotulo">Já pago</span>
              <strong>{formatarMoeda(totalPago)}</strong>
            </div>
            <div>
              <span className="rotulo">Falta pagar</span>
              <strong>{formatarMoeda(totalFalta)}</strong>
            </div>
          </div>

          {linhas.length >= LIMITE && (
            <p className="nota">
              Mostrando as primeiras {LIMITE} folhas. Use os filtros para ver as demais.
            </p>
          )}

          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Mês de referência</th>
                  <th>Funcionário</th>
                  <th className="num">Valor líquido</th>
                  <th className="num">Falta pagar</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td>{formatarData(l.data_vencimento)}</td>
                    <td>{formatarMes(l.competencia)}</td>
                    <td>
                      <Link className="link-forte" to={`/funcionarios/folha/${l.id}`}>
                        {l.funcionario_nome}
                      </Link>
                    </td>
                    <td className="num">{formatarMoeda(l.valor_liquido)}</td>
                    <td className="num">
                      {l.status === 'Cancelada' ? '—' : formatarMoeda(l.saldo_a_pagar)}
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