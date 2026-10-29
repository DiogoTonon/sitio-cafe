import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StatusBadge from '../componentes/StatusBadge'
import PagamentosRh from '../componentes/PagamentosRh'
import FolhaItens from '../componentes/FolhaItens'
import {
  formatarData,
  formatarDataHora,
  formatarMes,
  formatarMoeda,
  hojeISO,
  lerValor,
  numeroBR,
  vencimentoDaFolha,
} from '../lib/formatar'

type Fixo = {
  id: string
  nome: string
  salario_base: number
  dia_pagamento: number
  pagamento_mes_seguinte: boolean
}

type Folha = {
  id: string
  funcionario_id: string
  funcionario_nome: string
  funcionario_funcao: string | null
  competencia: string
  salario: number
  data_vencimento: string
  observacoes: string | null
  cancelada: boolean
  motivo_cancelamento: string | null
  cancelada_em: string | null
  horas_extras_valor: number
  descontos_valor: number
  adiantamentos_valor: number
  total_pago: number
  valor_liquido: number
  saldo_a_pagar: number
  status: string
}

function mensagemDeErro(e: { code?: string; message: string }) {
  if (e.code === 'P0001') return e.message
  if (e.code === '23505') {
    return 'Já existe uma folha deste funcionário para este mês. Abra a folha existente na lista.'
  }
  if (e.code === '23514') return 'Algum campo está com valor inválido. Confira os valores e as datas.'
  return 'Não foi possível salvar. Verifique a internet e tente de novo.'
}

function irParaTopo() {
  window.scrollTo({ top: 0, behavior: 'auto' })
}

export default function FolhaForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const avisoInicial = (location.state as { aviso?: string } | null)?.aviso ?? ''

  const [fixos, setFixos] = useState<Fixo[]>([])
  const [folha, setFolha] = useState<Folha | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState(avisoInicial)
  const [salvando, setSalvando] = useState(false)

  const [funcId, setFuncId] = useState('')
  const [mes, setMes] = useState(hojeISO().slice(0, 7))
  const [salarioTexto, setSalarioTexto] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(async () => {
    if (!id) {
      const f = await supabase
        .from('funcionarios')
        .select('id, nome, salario_base, dia_pagamento, pagamento_mes_seguinte')
        .eq('tipo', 'fixo')
        .eq('ativo', true)
        .order('nome')
      if (f.error) {
        setErro('Não foi possível carregar os funcionários. Recarregue a página.')
      } else {
        setFixos(f.data)
      }
    } else {
      const r = await supabase.from('v_folhas').select('*').eq('id', id).maybeSingle()
      if (r.error || !r.data) {
        setErro('Não encontramos esta folha.')
      } else {
        const d: Folha = r.data
        setFolha(d)
        setSalarioTexto(numeroBR(d.salario))
        setVencimento(d.data_vencimento)
        setObservacoes(d.observacoes ?? '')
      }
    }
    setCarregando(false)
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  function escolherFuncionario(novoId: string) {
    setFuncId(novoId)
    const f = fixos.find((x) => x.id === novoId)
    if (f) {
      setSalarioTexto(numeroBR(f.salario_base))
      if (mes) setVencimento(vencimentoDaFolha(mes, f.dia_pagamento, f.pagamento_mes_seguinte))
    }
  }

  function escolherMes(novoMes: string) {
    setMes(novoMes)
    const f = fixos.find((x) => x.id === funcId)
    if (f && novoMes) {
      setVencimento(vencimentoDaFolha(novoMes, f.dia_pagamento, f.pagamento_mes_seguinte))
    }
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')

    const salario = lerValor(salarioTexto)
    if (salario === null || salario <= 0) {
      setErro('Digite o salário do mês, maior que zero. Use vírgula para os centavos.')
      irParaTopo()
      return
    }

    setSalvando(true)

    if (!id) {
      const { data, error } = await supabase
        .from('folhas')
        .insert({
          funcionario_id: funcId,
          competencia: `${mes}-01`,
          salario,
          data_vencimento: vencimento,
          observacoes: observacoes.trim() || null,
        })
        .select('id')
        .single()
      setSalvando(false)
      if (error) {
        setErro(mensagemDeErro(error))
        irParaTopo()
        return
      }
      navigate(`/funcionarios/folha/${data.id}`, {
        state: { aviso: 'Folha criada. Ela já aparece na lista da folha mensal.' },
      })
      return
    }

    const { data, error } = await supabase
      .from('folhas')
      .update({
        salario,
        data_vencimento: vencimento,
        observacoes: observacoes.trim() || null,
      })
      .eq('id', id)
      .select('id')
    setSalvando(false)

    if (error) {
      setErro(mensagemDeErro(error))
      irParaTopo()
      return
    }
    if (!data || data.length === 0) {
      setErro('Não foi possível salvar as alterações.')
      irParaTopo()
      return
    }
    setAviso('Alterações salvas.')
    irParaTopo()
    carregar()
  }

  async function cancelarFolha(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')
    setSalvando(true)
    const { data, error } = await supabase
      .from('folhas')
      .update({ cancelada: true, motivo_cancelamento: motivo.trim() })
      .eq('id', id)
      .select('id')
    setSalvando(false)

    if (error) {
      setErro(mensagemDeErro(error))
      irParaTopo()
      return
    }
    if (!data || data.length === 0) {
      setErro('Não foi possível cancelar a folha.')
      irParaTopo()
      return
    }
    setCancelando(false)
    setMotivo('')
    setAviso('Folha cancelada. Ela fica guardada no histórico, mas não entra mais nos totais.')
    irParaTopo()
    carregar()
  }

  if (carregando) return <p>Carregando...</p>

  if (id && !folha) {
    return (
      <>
        <p className="erro" role="alert">
          {erro || 'Não encontramos esta folha.'}
        </p>
        <Link className="botao-texto" to="/funcionarios/folha">
          ← Voltar para a folha mensal
        </Link>
      </>
    )
  }

  const bloqueada = folha?.cancelada === true

  return (
    <>
      <h2>{id ? 'Detalhes da folha' : 'Nova folha'}</h2>
      <Link className="botao-texto" to="/funcionarios/folha">
        ← Voltar para a folha mensal
      </Link>

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

      {folha && (
        <section className="bloco">
          <div className="resumo-topo">
            <StatusBadge status={folha.status} />
          </div>
          <p>
            <strong>{folha.funcionario_nome}</strong>
            {folha.funcionario_funcao ? ` · ${folha.funcionario_funcao}` : ''} · mês de referência{' '}
            <strong>{formatarMes(folha.competencia)}</strong>
          </p>
          <dl className="resumo">
            <div>
              <dt>Salário do mês</dt>
              <dd>{formatarMoeda(folha.salario)}</dd>
            </div>
            <div>
              <dt>Horas extras (+)</dt>
              <dd>{formatarMoeda(folha.horas_extras_valor)}</dd>
            </div>
            <div>
              <dt>Descontos (−)</dt>
              <dd>{formatarMoeda(folha.descontos_valor)}</dd>
            </div>
            <div>
              <dt>Adiantamentos (−)</dt>
              <dd>{formatarMoeda(folha.adiantamentos_valor)}</dd>
            </div>
            <div>
              <dt>Valor líquido</dt>
              <dd>{formatarMoeda(folha.valor_liquido)}</dd>
            </div>
            <div>
              <dt>Já pago</dt>
              <dd>{formatarMoeda(folha.total_pago)}</dd>
            </div>
            <div>
              <dt>Falta pagar</dt>
              <dd>{folha.cancelada ? '—' : formatarMoeda(folha.saldo_a_pagar)}</dd>
            </div>
            <div>
              <dt>Vencimento</dt>
              <dd>{formatarData(folha.data_vencimento)}</dd>
            </div>
          </dl>
          <p className="nota">
            Valor líquido = salário + horas extras − descontos − adiantamentos. Os adiantamentos já
            foram entregues ao funcionário, por isso não entram no que falta pagar.
          </p>
          {folha.cancelada && (
            <p className="nota">
              Cancelada em {formatarDataHora(folha.cancelada_em)}. Motivo: {folha.motivo_cancelamento}
            </p>
          )}
        </section>
      )}

            {folha && (
        <FolhaItens folhaId={folha.id} cancelada={folha.cancelada} aoMudar={carregar} />
      )}

      {folha && (
        <PagamentosRh
          folhaId={folha.id}
          saldo={folha.saldo_a_pagar}
          cancelada={folha.cancelada}
          textoQuitado="O valor líquido desta folha já foi totalmente pago."
          aoMudar={carregar}
        />
      )}

      {!id && fixos.length === 0 && !erro ? (
        <section className="bloco">
          <p>
            Não há funcionários fixos ativos. Cadastre um em{' '}
            <Link className="link-forte" to="/funcionarios">
              Funcionários &gt; Pessoas
            </Link>{' '}
            para criar uma folha.
          </p>
        </section>
      ) : (
        <form className="bloco" onSubmit={salvar}>
          <fieldset className="sem-borda" disabled={bloqueada || salvando}>
            {bloqueada && (
              <p className="nota">Esta folha está cancelada e não pode mais ser alterada.</p>
            )}

            <div className="grade">
              {!id && (
                <>
                  <div className="campo">
                    <label htmlFor="fo-func">
                      Funcionário <span className="obrig">(obrigatório)</span>
                    </label>
                    <select
                      id="fo-func"
                      required
                      value={funcId}
                      onChange={(e) => escolherFuncionario(e.target.value)}
                    >
                      <option value="">Escolha o funcionário...</option>
                      {fixos.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="campo">
                    <label htmlFor="fo-mes">
                      Mês de referência <span className="obrig">(obrigatório)</span>
                    </label>
                    <input
                      id="fo-mes"
                      type="month"
                      required
                      value={mes}
                      onChange={(e) => escolherMes(e.target.value)}
                    />
                    <span className="dica">Mês em que o funcionário trabalhou.</span>
                  </div>
                </>
              )}

              <div className="campo">
                <label htmlFor="fo-salario">
                  Salário do mês (R$) <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="fo-salario"
                  type="text"
                  inputMode="decimal"
                  required
                  value={salarioTexto}
                  onChange={(e) => setSalarioTexto(e.target.value)}
                />
                <span className="dica">
                  {id
                    ? 'Mudar aqui altera só esta folha. O salário base do cadastro não muda.'
                    : 'Já vem do cadastro da pessoa. Pode ajustar só para este mês.'}
                </span>
              </div>

              <div className="campo">
                <label htmlFor="fo-venc">
                  Data de vencimento <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="fo-venc"
                  type="date"
                  required
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                />
                <span className="dica">Dia em que o pagamento deve ser feito.</span>
              </div>

              <div className="campo largo">
                <label htmlFor="fo-obs">Observações</label>
                <textarea
                  id="fo-obs"
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
            </div>

            {!bloqueada && (
              <button className="botao" type="submit">
                {salvando ? 'Salvando...' : id ? 'Salvar alterações' : 'Criar folha'}
              </button>
            )}
          </fieldset>
        </form>
      )}

      {folha && !bloqueada && (
        <section className="bloco">
          {!cancelando ? (
            <button className="botao-texto perigo" type="button" onClick={() => setCancelando(true)}>
              Cancelar esta folha
            </button>
          ) : (
            <form onSubmit={cancelarFolha}>
              <label htmlFor="fo-motivo">
                Por que esta folha será cancelada? <span className="obrig">(obrigatório)</span>
              </label>
              <textarea
                id="fo-motivo"
                rows={2}
                required
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
              <p className="nota">
                A folha não é apagada: fica guardada no histórico, mas sai dos totais. Folhas com
                pagamentos ou adiantamentos não podem ser canceladas: exclua-os primeiro.
              </p>
              <div className="linha">
                <button className="botao-pequeno" type="submit" disabled={salvando}>
                  Confirmar cancelamento
                </button>
                <button
                  className="botao-pequeno secundario"
                  type="button"
                  onClick={() => {
                    setCancelando(false)
                    setMotivo('')
                  }}
                >
                  Voltar
                </button>
              </div>
            </form>
          )}
        </section>
      )}
    </>
  )
}