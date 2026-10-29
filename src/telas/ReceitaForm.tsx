import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StatusBadge from '../componentes/StatusBadge'
import Recebimentos from '../componentes/Recebimentos'
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  hojeISO,
  lerValor,
  numeroBR,
} from '../lib/formatar'

type Tipo = { id: string; nome: string; ativo: boolean }
type Receita = {
  id: string
  descricao: string
  tipo_id: string
  valor_total: number
  data_lancamento: string
  data_prevista: string | null
  competencia: string | null
  comprador: string | null
  observacoes: string | null
  cancelada: boolean
  motivo_cancelamento: string | null
  cancelada_em: string | null
  valor_recebido: number
  saldo_a_receber: number
  status: string
}

function mensagemDeErro(e: { code?: string; message: string }) {
  if (e.code === 'P0001') return e.message
  if (e.code === '23514') return 'Algum campo está com valor inválido. Confira os valores e as datas.'
  return 'Não foi possível salvar. Verifique a internet e tente de novo.'
}

function irParaTopo() {
  window.scrollTo({ top: 0, behavior: 'auto' })
}

export default function ReceitaForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const avisoInicial = (location.state as { aviso?: string } | null)?.aviso ?? ''

  const [tipos, setTipos] = useState<Tipo[]>([])
  const [receita, setReceita] = useState<Receita | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState(avisoInicial)
  const [salvando, setSalvando] = useState(false)

  const [descricao, setDescricao] = useState('')
  const [tipoId, setTipoId] = useState('')
  const [valorTexto, setValorTexto] = useState('')
  const [lancamento, setLancamento] = useState(hojeISO())
  const [prevista, setPrevista] = useState('')
  const [competencia, setCompetencia] = useState('')
  const [comprador, setComprador] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const [novoTipoAberto, setNovoTipoAberto] = useState(false)
  const [novoTipoNome, setNovoTipoNome] = useState('')
  const [novoTipoErro, setNovoTipoErro] = useState('')
  const [criandoTipo, setCriandoTipo] = useState(false)

  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(async () => {
    const t = await supabase.from('tipos_receita').select('id, nome, ativo').order('nome')
    if (t.error) {
      setErro('Não foi possível carregar os tipos de receita. Recarregue a página.')
      setCarregando(false)
      return
    }
    setTipos(t.data)

    if (id) {
      const r = await supabase.from('v_contas_receber').select('*').eq('id', id).maybeSingle()
      if (r.error || !r.data) {
        setErro('Não encontramos esta receita.')
      } else {
        const d: Receita = r.data
        setReceita(d)
        setDescricao(d.descricao)
        setTipoId(d.tipo_id)
        setValorTexto(numeroBR(d.valor_total))
        setLancamento(d.data_lancamento)
        setPrevista(d.data_prevista ?? '')
        setCompetencia(d.competencia ? d.competencia.slice(0, 7) : '')
        setComprador(d.comprador ?? '')
        setObservacoes(d.observacoes ?? '')
      }
    }
    setCarregando(false)
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function criarTipo() {
    setNovoTipoErro('')
    const nome = novoTipoNome.trim()
    if (!nome) {
      setNovoTipoErro('Digite o nome do tipo de receita.')
      return
    }
    setCriandoTipo(true)
    const { data, error } = await supabase
      .from('tipos_receita')
      .insert({ nome })
      .select('id, nome, ativo')
      .single()
    setCriandoTipo(false)

    if (error) {
      setNovoTipoErro(
        error.code === '23505'
          ? 'Já existe um tipo com esse nome. Escolha-o na lista acima.'
          : 'Não foi possível cadastrar. Verifique a internet e tente de novo.',
      )
      return
    }
    setTipos((lista) => [...lista, data].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')))
    setTipoId(data.id)
    setNovoTipoNome('')
    setNovoTipoAberto(false)
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')

    const valor = lerValor(valorTexto)
    if (valor === null || valor <= 0) {
      setErro('Digite um valor maior que zero, por exemplo 5.800,00. Use vírgula para os centavos.')
      irParaTopo()
      return
    }

    const dados = {
      descricao: descricao.trim(),
      tipo_id: tipoId,
      valor_total: valor,
      data_lancamento: lancamento,
      data_prevista: prevista || null,
      competencia: competencia ? `${competencia}-01` : null,
      comprador: comprador.trim() || null,
      observacoes: observacoes.trim() || null,
    }

    setSalvando(true)

    if (!id) {
      const { data, error } = await supabase.from('contas_receber').insert(dados).select('id').single()
      setSalvando(false)
      if (error) {
        setErro(mensagemDeErro(error))
        irParaTopo()
        return
      }
      navigate(`/contas-receber/${data.id}`, {
        state: { aviso: 'Receita cadastrada. Ela já aparece na lista de contas a receber.' },
      })
      return
    }

    const { data, error } = await supabase.from('contas_receber').update(dados).eq('id', id).select('id')
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

  async function cancelarReceita(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')
    setSalvando(true)
    const { data, error } = await supabase
      .from('contas_receber')
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
      setErro('Não foi possível cancelar a receita.')
      irParaTopo()
      return
    }
    setCancelando(false)
    setMotivo('')
    setAviso('Receita cancelada. Ela fica guardada no histórico, mas não entra mais nos totais.')
    irParaTopo()
    carregar()
  }

  if (carregando) return <p>Carregando...</p>

  if (id && !receita) {
    return (
      <>
        <p className="erro" role="alert">
          {erro || 'Não encontramos esta receita.'}
        </p>
        <Link className="botao-texto" to="/contas-receber">
          ← Voltar para contas a receber
        </Link>
      </>
    )
  }

  const bloqueada = receita?.cancelada === true
  const tiposLista = tipos.filter((t) => t.ativo || t.id === tipoId)

  return (
    <>
      <h1>{id ? 'Detalhes da receita' : 'Nova receita'}</h1>
      <Link className="botao-texto" to="/contas-receber">
        ← Voltar para contas a receber
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

      {receita && (
        <section className="bloco">
          <div className="resumo-topo">
            <StatusBadge status={receita.status} />
          </div>
          <dl className="resumo">
            <div>
              <dt>Valor total</dt>
              <dd>{formatarMoeda(receita.valor_total)}</dd>
            </div>
            <div>
              <dt>Já recebido</dt>
              <dd>{formatarMoeda(receita.valor_recebido)}</dd>
            </div>
            <div>
              <dt>Falta receber</dt>
              <dd>{receita.cancelada ? '—' : formatarMoeda(receita.saldo_a_receber)}</dd>
            </div>
            <div>
              <dt>Recebimento previsto</dt>
              <dd>{receita.data_prevista ? formatarData(receita.data_prevista) : 'Sem previsão'}</dd>
            </div>
          </dl>
          {receita.cancelada && (
            <p className="nota">
              Cancelada em {formatarDataHora(receita.cancelada_em)}. Motivo:{' '}
              {receita.motivo_cancelamento}
            </p>
          )}
        </section>
      )}

      {receita && (
        <Recebimentos
          contaId={receita.id}
          saldoAReceber={receita.saldo_a_receber}
          cancelada={receita.cancelada}
          aoMudar={carregar}
        />
      )}
      
      <form className="bloco" onSubmit={salvar}>
        <fieldset className="sem-borda" disabled={bloqueada || salvando}>
          {bloqueada && (
            <p className="nota">Esta receita está cancelada e não pode mais ser alterada.</p>
          )}

          <div className="grade">
            <div className="campo largo">
              <label htmlFor="r-descricao">
                Descrição <span className="obrig">(obrigatório)</span>
              </label>
              <input
                id="r-descricao"
                type="text"
                required
                maxLength={200}
                placeholder="Ex.: Venda de 50 sacas de café"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            <div className="campo largo">
              <label htmlFor="r-tipo">
                Tipo de receita <span className="obrig">(obrigatório)</span>
              </label>
              <select id="r-tipo" required value={tipoId} onChange={(e) => setTipoId(e.target.value)}>
                <option value="">Escolha o tipo...</option>
                {tiposLista.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                    {t.ativo ? '' : ' (desativado)'}
                  </option>
                ))}
              </select>

              {!bloqueada && !novoTipoAberto && (
                <button
                  className="botao-texto"
                  type="button"
                  onClick={() => {
                    setNovoTipoErro('')
                    setNovoTipoAberto(true)
                  }}
                >
                  + Cadastrar novo tipo de receita
                </button>
              )}

              {novoTipoAberto && (
                <div className="novo-forn">
                  <label htmlFor="novo-tipo-nome">Nome do novo tipo</label>
                  <input
                    id="novo-tipo-nome"
                    type="text"
                    maxLength={100}
                    placeholder="Ex.: Arrendamento"
                    value={novoTipoNome}
                    onChange={(e) => setNovoTipoNome(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        criarTipo()
                      }
                    }}
                  />
                  {novoTipoErro && (
                    <p className="erro" role="alert">
                      {novoTipoErro}
                    </p>
                  )}
                  <div className="linha">
                    <button
                      className="botao-pequeno"
                      type="button"
                      disabled={criandoTipo}
                      onClick={criarTipo}
                    >
                      {criandoTipo ? 'Cadastrando...' : 'Cadastrar tipo'}
                    </button>
                    <button
                      className="botao-pequeno secundario"
                      type="button"
                      onClick={() => {
                        setNovoTipoAberto(false)
                        setNovoTipoNome('')
                        setNovoTipoErro('')
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="campo">
              <label htmlFor="r-valor">
                Valor total (R$) <span className="obrig">(obrigatório)</span>
              </label>
              <input
                id="r-valor"
                type="text"
                inputMode="decimal"
                required
                placeholder="Ex.: 5.800,00"
                value={valorTexto}
                onChange={(e) => setValorTexto(e.target.value)}
              />
              <span className="dica">Use vírgula para os centavos.</span>
            </div>

            <div className="campo">
              <label htmlFor="r-comprador">Comprador ou cliente</label>
              <input
                id="r-comprador"
                type="text"
                maxLength={150}
                value={comprador}
                onChange={(e) => setComprador(e.target.value)}
              />
            </div>

            <div className="campo">
              <label htmlFor="r-lancamento">
                Data do lançamento <span className="obrig">(obrigatório)</span>
              </label>
              <input
                id="r-lancamento"
                type="date"
                required
                value={lancamento}
                onChange={(e) => setLancamento(e.target.value)}
              />
              <span className="dica">Dia em que a venda foi registrada aqui.</span>
            </div>

            <div className="campo">
              <label htmlFor="r-prevista">Data prevista para receber</label>
              <input
                id="r-prevista"
                type="date"
                value={prevista}
                onChange={(e) => setPrevista(e.target.value)}
              />
              <span className="dica">Opcional. Serve para saber o que ainda está por entrar.</span>
            </div>

            <div className="campo">
              <label htmlFor="r-competencia">Mês de referência</label>
              <input
                id="r-competencia"
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
              />
              <span className="dica">
                Mês a que a receita pertence. Se deixar em branco, os relatórios usam a data prevista.
              </span>
            </div>

            <div className="campo largo">
              <label htmlFor="r-obs">Observações</label>
              <textarea
                id="r-obs"
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
          </div>

          {!bloqueada && (
            <button className="botao" type="submit">
              {salvando ? 'Salvando...' : id ? 'Salvar alterações' : 'Cadastrar receita'}
            </button>
          )}
        </fieldset>
      </form>

      {receita && !bloqueada && (
        <section className="bloco">
          {!cancelando ? (
            <button className="botao-texto perigo" type="button" onClick={() => setCancelando(true)}>
              Cancelar esta receita
            </button>
          ) : (
            <form onSubmit={cancelarReceita}>
              <label htmlFor="r-motivo">
                Por que esta receita será cancelada? <span className="obrig">(obrigatório)</span>
              </label>
              <textarea
                id="r-motivo"
                rows={2}
                required
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
              <p className="nota">
                A receita não é apagada: ela fica guardada no histórico, mas sai dos totais. Receitas
                que já tiveram recebimentos não podem ser canceladas.
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