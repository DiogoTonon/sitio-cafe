import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StatusBadge from '../componentes/StatusBadge'
import ServicoDias from '../componentes/ServicoDias'
import PagamentosRh from '../componentes/PagamentosRh'
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarQuantidade,
  lerValor,
  numeroBR,
} from '../lib/formatar'

type Pessoa = { id: string; nome: string }
type Servico = {
  id: string
  funcionario_id: string
  funcionario_nome: string
  modalidade: 'diaria' | 'empreita'
  descricao: string | null
  valor_unitario: number
  data_vencimento: string | null
  observacoes: string | null
  cancelada: boolean
  motivo_cancelamento: string | null
  cancelada_em: string | null
  qtd_dias: number
  quantidade_total: number
  total_a_pagar: number
  total_pago: number
  saldo_a_pagar: number
  status: string
}

function mensagemDeErro(e: { code?: string; message: string }) {
  if (e.code === 'P0001') return e.message
  if (e.code === '23514') return 'Algum campo está com valor inválido. Confira os valores.'
  return 'Não foi possível salvar. Verifique a internet e tente de novo.'
}

function irParaTopo() {
  window.scrollTo({ top: 0, behavior: 'auto' })
}

export default function ServicoForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const avisoInicial = (location.state as { aviso?: string } | null)?.aviso ?? ''

  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [servico, setServico] = useState<Servico | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState(avisoInicial)
  const [salvando, setSalvando] = useState(false)

  const [pessoaId, setPessoaId] = useState('')
  const [modalidadeNova, setModalidadeNova] = useState<'diaria' | 'empreita'>('diaria')
  const [descricao, setDescricao] = useState('')
  const [valorTxt, setValorTxt] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(async () => {
    if (!id) {
      const p = await supabase
        .from('funcionarios')
        .select('id, nome')
        .eq('tipo', 'temporario')
        .eq('ativo', true)
        .order('nome')
      if (p.error) setErro('Não foi possível carregar as pessoas. Recarregue a página.')
      else setPessoas(p.data)
    } else {
      const r = await supabase.from('v_servicos_temp').select('*').eq('id', id).maybeSingle()
      if (r.error || !r.data) {
        setErro('Não encontramos este lançamento.')
      } else {
        const d: Servico = r.data
        setServico(d)
        setDescricao(d.descricao ?? '')
        setValorTxt(numeroBR(d.valor_unitario))
        setVencimento(d.data_vencimento ?? '')
        setObservacoes(d.observacoes ?? '')
      }
    }
    setCarregando(false)
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const modalidade = servico?.modalidade ?? modalidadeNova
  const rotuloValor = modalidade === 'diaria' ? 'Valor da diária (R$)' : 'Valor por saco (R$)'

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')

    const valor = lerValor(valorTxt)
    if (valor === null || valor <= 0) {
      setErro('Digite o valor combinado, maior que zero (ex.: 120,00). Use vírgula para os centavos.')
      irParaTopo()
      return
    }

    const dados = {
      descricao: descricao.trim() || null,
      valor_unitario: valor,
      data_vencimento: vencimento || null,
      observacoes: observacoes.trim() || null,
    }

    setSalvando(true)

    if (!id) {
      const { data, error } = await supabase
        .from('servicos_temp')
        .insert({ ...dados, funcionario_id: pessoaId, modalidade: modalidadeNova })
        .select('id')
        .single()
      setSalvando(false)
      if (error) {
        setErro(mensagemDeErro(error))
        irParaTopo()
        return
      }
      navigate(`/funcionarios/temporarios/${data.id}`, {
        state: { aviso: 'Lançamento criado. Agora marque os dias trabalhados no calendário.' },
      })
      return
    }

    const { data, error } = await supabase.from('servicos_temp').update(dados).eq('id', id).select('id')
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

  async function cancelar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')
    setSalvando(true)
    const { data, error } = await supabase
      .from('servicos_temp')
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
      setErro('Não foi possível cancelar o lançamento.')
      irParaTopo()
      return
    }
    setCancelando(false)
    setMotivo('')
    setAviso('Lançamento cancelado. Ele fica guardado no histórico, mas não entra mais nos totais.')
    irParaTopo()
    carregar()
  }

  if (carregando) return <p>Carregando...</p>

  if (id && !servico) {
    return (
      <>
        <p className="erro" role="alert">
          {erro || 'Não encontramos este lançamento.'}
        </p>
        <Link className="botao-texto" to="/funcionarios/temporarios">
          ← Voltar para temporários
        </Link>
      </>
    )
  }

  const bloqueado = servico?.cancelada === true

  return (
    <>
      <h2>{id ? 'Detalhes do lançamento' : 'Novo lançamento de temporário'}</h2>
      <Link className="botao-texto" to="/funcionarios/temporarios">
        ← Voltar para temporários
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

      {servico && (
        <section className="bloco">
          <div className="resumo-topo">
            <StatusBadge status={servico.status} />
          </div>
          <p>
            <strong>{servico.funcionario_nome}</strong> ·{' '}
            {servico.modalidade === 'diaria' ? 'Diária' : 'Empreita (por saco)'}
          </p>
          <dl className="resumo">
            <div>
              <dt>{servico.modalidade === 'diaria' ? 'Dias trabalhados' : 'Sacos colhidos'}</dt>
              <dd>
                {servico.modalidade === 'diaria'
                  ? servico.qtd_dias
                  : `${formatarQuantidade(servico.quantidade_total)} em ${servico.qtd_dias} dias`}
              </dd>
            </div>
            <div>
              <dt>{servico.modalidade === 'diaria' ? 'Valor da diária' : 'Valor por saco'}</dt>
              <dd>{formatarMoeda(servico.valor_unitario)}</dd>
            </div>
            <div>
              <dt>Total a pagar</dt>
              <dd>{formatarMoeda(servico.total_a_pagar)}</dd>
            </div>
            <div>
              <dt>Já pago</dt>
              <dd>{formatarMoeda(servico.total_pago)}</dd>
            </div>
            <div>
              <dt>Falta pagar</dt>
              <dd>{servico.cancelada ? '—' : formatarMoeda(servico.saldo_a_pagar)}</dd>
            </div>
            {servico.data_vencimento && (
              <div>
                <dt>Pagar até</dt>
                <dd>{formatarData(servico.data_vencimento)}</dd>
              </div>
            )}
          </dl>
          {servico.cancelada && (
            <p className="nota">
              Cancelado em {formatarDataHora(servico.cancelada_em)}. Motivo: {servico.motivo_cancelamento}
            </p>
          )}
        </section>
      )}

      {servico && (
        <ServicoDias
          servicoId={servico.id}
          modalidade={servico.modalidade}
          cancelada={servico.cancelada}
          aoMudar={carregar}
        />
      )}

      {servico && (
        <PagamentosRh
          servicoId={servico.id}
          saldo={servico.saldo_a_pagar}
          cancelada={servico.cancelada}
          textoQuitado={
            servico.total_a_pagar === 0
              ? 'Marque os dias trabalhados para liberar o pagamento.'
              : 'O total deste lançamento já foi totalmente pago.'
          }
          aoMudar={carregar}
        />
      )}

      {!id && pessoas.length === 0 && !erro ? (
        <section className="bloco">
          <p>
            Não há temporários ativos. Cadastre em{' '}
            <Link className="link-forte" to="/funcionarios">
              Funcionários &gt; Pessoas
            </Link>{' '}
            (tipo Temporário).
          </p>
        </section>
      ) : (
        <form className="bloco" onSubmit={salvar}>
          <fieldset className="sem-borda" disabled={bloqueado || salvando}>
            {bloqueado && (
              <p className="nota">Este lançamento está cancelado e não pode mais ser alterado.</p>
            )}

            <div className="grade">
              {!id && (
                <>
                  <div className="campo">
                    <label htmlFor="sv-pessoa">
                      Pessoa <span className="obrig">(obrigatório)</span>
                    </label>
                    <select
                      id="sv-pessoa"
                      required
                      value={pessoaId}
                      onChange={(e) => setPessoaId(e.target.value)}
                    >
                      <option value="">Escolha a pessoa...</option>
                      {pessoas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="campo">
                    <label htmlFor="sv-mod">
                      Forma de pagamento <span className="obrig">(obrigatório)</span>
                    </label>
                    <select
                      id="sv-mod"
                      value={modalidadeNova}
                      onChange={(e) => setModalidadeNova(e.target.value as 'diaria' | 'empreita')}
                    >
                      <option value="diaria">Por diária (valor por dia trabalhado)</option>
                      <option value="empreita">Por empreita (valor por saco de café)</option>
                    </select>
                    <span className="dica">Não pode ser mudada depois.</span>
                  </div>
                </>
              )}

              <div className="campo">
                <label htmlFor="sv-valor">
                  {rotuloValor} <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="sv-valor"
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="Ex.: 120,00"
                  value={valorTxt}
                  onChange={(e) => setValorTxt(e.target.value)}
                />
                <span className="dica">Combinado para este lançamento. Use vírgula para os centavos.</span>
              </div>

              <div className="campo">
                <label htmlFor="sv-venc">Pagar até</label>
                <input
                  id="sv-venc"
                  type="date"
                  value={vencimento}
                  onChange={(e) => setVencimento(e.target.value)}
                />
                <span className="dica">Opcional. Serve para o aviso de atraso.</span>
              </div>

              <div className="campo largo">
                <label htmlFor="sv-desc">Descrição do serviço</label>
                <input
                  id="sv-desc"
                  type="text"
                  maxLength={200}
                  placeholder="Ex.: Colheita do talhão 3"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>

              <div className="campo largo">
                <label htmlFor="sv-obs">Observações</label>
                <textarea
                  id="sv-obs"
                  rows={2}
                  value={observacoes}
                  onChange={(e) => setObservacoes(e.target.value)}
                />
              </div>
            </div>

            {!bloqueado && (
              <button className="botao" type="submit">
                {salvando ? 'Salvando...' : id ? 'Salvar alterações' : 'Criar lançamento'}
              </button>
            )}
          </fieldset>
        </form>
      )}

      {servico && !bloqueado && (
        <section className="bloco">
          {!cancelando ? (
            <button className="botao-texto perigo" type="button" onClick={() => setCancelando(true)}>
              Cancelar este lançamento
            </button>
          ) : (
            <form onSubmit={cancelar}>
              <label htmlFor="sv-motivo">
                Por que será cancelado? <span className="obrig">(obrigatório)</span>
              </label>
              <textarea
                id="sv-motivo"
                rows={2}
                required
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
              <p className="nota">
                Não é apagado: fica guardado no histórico, mas sai dos totais. Lançamentos com
                pagamentos não podem ser cancelados: exclua os pagamentos primeiro.
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