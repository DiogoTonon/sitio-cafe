import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StatusBadge from '../componentes/StatusBadge'
import { formatarMoeda, formatarQuantidade, hojeISO } from '../lib/formatar'

type Pessoa = { id: string; nome: string }
type Servico = {
  id: string
  funcionario_id: string
  funcionario_nome: string
  modalidade: 'diaria' | 'empreita'
  descricao: string | null
  qtd_dias: number
  quantidade_total: number
  total_a_pagar: number
  total_pago: number
  saldo_a_pagar: number
  status: string
}

const STATUS_ABERTOS = ['Pendente', 'Atrasada', 'Parcialmente paga']
const LIMITE = 500

function somar(valores: number[]) {
  return valores.reduce((t, v) => t + Math.round(Number(v) * 100), 0) / 100
}

export default function ServicosTemp() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [linhas, setLinhas] = useState<Servico[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [fStatus, setFStatus] = useState('abertas')
  const [fAno, setFAno] = useState('todos')
  const [fPessoa, setFPessoa] = useState('')

  const anoAtual = Number(hojeISO().slice(0, 4))
  const anos = Array.from({ length: 8 }, (_, i) => anoAtual + 1 - i)

  useEffect(() => {
    supabase
      .from('funcionarios')
      .select('id, nome')
      .eq('tipo', 'temporario')
      .order('nome')
      .then(({ data }) => setPessoas(data ?? []))
  }, [])

  useEffect(() => {
    let cancelado = false
    async function buscar() {
      setCarregando(true)
      setErro('')
      let q = supabase.from('v_servicos_temp').select('*').limit(LIMITE)
      if (fStatus === 'abertas') q = q.in('status', STATUS_ABERTOS)
      else if (fStatus !== 'todos') q = q.eq('status', fStatus)
      if (fAno !== 'todos') {
        q = q
          .gte('criado_em', `${fAno}-01-01T03:00:00Z`)
          .lt('criado_em', `${Number(fAno) + 1}-01-01T03:00:00Z`)
      }
      if (fPessoa) q = q.eq('funcionario_id', fPessoa)
      q = q.order('criado_em', { ascending: false })

      const { data, error } = await q
      if (cancelado) return
      if (error) {
        setErro('Não foi possível carregar os lançamentos. Verifique a internet e recarregue a página.')
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
  }, [fStatus, fAno, fPessoa])

  const validas = linhas.filter((l) => l.status !== 'Cancelada')

  return (
    <>
      <div className="cabecalho-pagina">
        <h2>Temporários</h2>
        <Link className="botao-link" to="/funcionarios/temporarios/novo">
          + Novo lançamento
        </Link>
      </div>
      <p>
        Trabalho por diária ou empreita. Cada lançamento tem os dias trabalhados, o valor combinado
        e o controle do que já foi pago.
      </p>

      <section className="bloco filtros">
        <div className="campo">
          <label htmlFor="st-status">Situação</label>
          <select id="st-status" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            <option value="abertas">Em aberto (pendentes, atrasadas e parciais)</option>
            <option value="todos">Todos</option>
            <option value="Pendente">Pendentes</option>
            <option value="Parcialmente paga">Parcialmente pagos</option>
            <option value="Paga">Pagos</option>
            <option value="Cancelada">Cancelados</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="st-ano">Ano do lançamento</label>
          <select id="st-ano" value={fAno} onChange={(e) => setFAno(e.target.value)}>
            <option value="todos">Todos os anos</option>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="st-pessoa">Pessoa</label>
          <select id="st-pessoa" value={fPessoa} onChange={(e) => setFPessoa(e.target.value)}>
            <option value="">Todas as pessoas</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="acoes-filtro">
          <button
            className="botao-pequeno secundario"
            type="button"
            onClick={() => {
              setFStatus('abertas')
              setFAno('todos')
              setFPessoa('')
            }}
          >
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
        <p>Carregando lançamentos...</p>
      ) : linhas.length === 0 ? (
        <p className="bloco">Nenhum lançamento encontrado com esses filtros.</p>
      ) : (
        <>
          <div className="totais">
            <div>
              <span className="rotulo">Lançamentos</span>
              <strong>{linhas.length}</strong>
            </div>
            <div>
              <span className="rotulo">Total a pagar (sem cancelados)</span>
              <strong>{formatarMoeda(somar(validas.map((l) => l.total_a_pagar)))}</strong>
            </div>
            <div>
              <span className="rotulo">Já pago</span>
              <strong>{formatarMoeda(somar(validas.map((l) => l.total_pago)))}</strong>
            </div>
            <div>
              <span className="rotulo">Falta pagar</span>
              <strong>{formatarMoeda(somar(validas.map((l) => l.saldo_a_pagar)))}</strong>
            </div>
          </div>

          {linhas.length >= LIMITE && (
            <p className="nota">Mostrando os primeiros {LIMITE}. Use os filtros para ver os demais.</p>
          )}

          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Serviço</th>
                  <th>Trabalho</th>
                  <th className="num">Total</th>
                  <th className="num">Falta pagar</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id}>
                    <td>{l.funcionario_nome}</td>
                    <td>
                      <Link className="link-forte" to={`/funcionarios/temporarios/${l.id}`}>
                        {l.descricao || (l.modalidade === 'diaria' ? 'Serviço por diária' : 'Serviço por empreita')}
                      </Link>
                      <span className="sub-nota">
                        {l.modalidade === 'diaria' ? 'Diária' : 'Empreita (por saco)'}
                      </span>
                    </td>
                    <td>
                      {l.modalidade === 'diaria'
                        ? `${l.qtd_dias} dias`
                        : `${formatarQuantidade(l.quantidade_total)} sacos`}
                    </td>
                    <td className="num">{formatarMoeda(l.total_a_pagar)}</td>
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