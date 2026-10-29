import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatarData, formatarMoeda, hojeISO, lerValor, numeroBR } from '../lib/formatar'

type Recebimento = {
  id: string
  data_recebimento: string
  valor: number
  observacoes: string | null
}

type Props = {
  contaId: string
  saldoAReceber: number
  cancelada: boolean
  aoMudar: () => void
}

const centavos = (n: number) => Math.round(n * 100)

function mensagemDeErro(e: { code?: string; message: string }) {
  if (e.code === 'P0001') return e.message
  if (e.code === '23514') return 'Algum campo está com valor inválido. Confira os valores e as datas.'
  return 'Não foi possível salvar. Verifique a internet e tente de novo.'
}

export default function Recebimentos({ contaId, saldoAReceber, cancelada, aoMudar }: Props) {
  const topoRef = useRef<HTMLElement>(null)

  const [lista, setLista] = useState<Recebimento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [data, setData] = useState(hojeISO())
  const [valorTexto, setValorTexto] = useState('')
  const [obs, setObs] = useState('')

  const carregar = useCallback(async () => {
    const { data: linhas, error } = await supabase
      .from('recebimentos')
      .select('id, data_recebimento, valor, observacoes')
      .eq('conta_id', contaId)
      .order('data_recebimento', { ascending: false })
      .order('criado_em', { ascending: false })
    if (error) setErro('Não foi possível carregar os recebimentos. Recarregue a página.')
    else setLista(linhas)
    setCarregando(false)
  }, [contaId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const anterior = editandoId ? lista.find((r) => r.id === editandoId) : undefined
  const disponivel =
    (centavos(saldoAReceber) + (anterior ? centavos(anterior.valor) : 0)) / 100

  function falha(texto: string) {
    setErro(texto)
    topoRef.current?.scrollIntoView({ block: 'start' })
  }

  function abrirNovo() {
    setErro('')
    setAviso('')
    setEditandoId(null)
    setData(hojeISO())
    setValorTexto(numeroBR(saldoAReceber))
    setObs('')
    setAberto(true)
  }

  function abrirEdicao(r: Recebimento) {
    setErro('')
    setAviso('')
    setEditandoId(r.id)
    setData(r.data_recebimento)
    setValorTexto(numeroBR(r.valor))
    setObs(r.observacoes ?? '')
    setAberto(true)
    topoRef.current?.scrollIntoView({ block: 'start' })
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')

    const valor = lerValor(valorTexto)
    if (valor === null || valor <= 0) {
      return falha('Digite o valor recebido, maior que zero. Use vírgula para os centavos.')
    }
    if (centavos(valor) > centavos(disponivel)) {
      return falha(
        `O valor passa do que falta receber. Você pode registrar no máximo ${formatarMoeda(disponivel)}.`,
      )
    }
    if (data > hojeISO()) {
      return falha('A data do recebimento não pode ser no futuro. Registre no dia em que receber.')
    }

    const dados = {
      conta_id: contaId,
      data_recebimento: data,
      valor,
      observacoes: obs.trim() || null,
    }

    setSalvando(true)
    const resposta = editandoId
      ? await supabase.from('recebimentos').update(dados).eq('id', editandoId).select('id')
      : await supabase.from('recebimentos').insert(dados).select('id')
    setSalvando(false)

    if (resposta.error) return falha(mensagemDeErro(resposta.error))
    if (!resposta.data || resposta.data.length === 0) {
      return falha('Não foi possível salvar o recebimento.')
    }

    setAberto(false)
    setEditandoId(null)
    setAviso(editandoId ? 'Recebimento corrigido.' : 'Recebimento registrado.')
    await carregar()
    aoMudar()
  }

  async function excluir(r: Recebimento) {
    setErro('')
    setAviso('')
    const confirmou = window.confirm(
      `Excluir o recebimento de ${formatarMoeda(r.valor)} feito em ${formatarData(r.data_recebimento)}?\n\nA receita volta a ter esse valor em aberto. A exclusão fica registrada no histórico.`,
    )
    if (!confirmou) return

    const { data: apagados, error } = await supabase
      .from('recebimentos')
      .delete()
      .eq('id', r.id)
      .select('id')

    if (error) return falha(mensagemDeErro(error))
    if (!apagados || apagados.length === 0) return falha('Não foi possível excluir o recebimento.')

    setAviso('Recebimento excluído.')
    await carregar()
    aoMudar()
  }

  if (carregando) {
    return (
      <section className="bloco">
        <p>Carregando recebimentos...</p>
      </section>
    )
  }

  const quitada = centavos(saldoAReceber) <= 0

  return (
    <section className="bloco" ref={topoRef}>
      <h2>Recebimentos</h2>

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

      {lista.length === 0 ? (
        <p className="nota">Nenhum recebimento registrado ainda.</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th className="num">Valor recebido</th>
                <th>Observações</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id}>
                  <td>{formatarData(r.data_recebimento)}</td>
                  <td className="num">{formatarMoeda(r.valor)}</td>
                  <td>{r.observacoes ?? '—'}</td>
                  <td>
                    {!cancelada && (
                      <>
                        <button className="botao-texto" type="button" onClick={() => abrirEdicao(r)}>
                          Corrigir
                        </button>{' '}
                        <button className="botao-texto perigo" type="button" onClick={() => excluir(r)}>
                          Excluir
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!cancelada && !aberto && (
        <div className="linha">
          {quitada ? (
            <p className="nota">Esta receita foi totalmente recebida.</p>
          ) : (
            <button className="botao-pequeno" type="button" onClick={abrirNovo}>
              + Registrar recebimento
            </button>
          )}
        </div>
      )}

      {aberto && (
        <form onSubmit={salvar}>
          <fieldset className="sem-borda" disabled={salvando}>
            <h3>{editandoId ? 'Corrigir recebimento' : 'Novo recebimento'}</h3>
            <p className="nota">Ainda falta receber até {formatarMoeda(disponivel)} desta receita.</p>

            <div className="grade">
              <div className="campo">
                <label htmlFor="rc-data">
                  Data do recebimento <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="rc-data"
                  type="date"
                  required
                  max={hojeISO()}
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>

              <div className="campo">
                <label htmlFor="rc-valor">
                  Valor recebido (R$) <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="rc-valor"
                  type="text"
                  inputMode="decimal"
                  required
                  value={valorTexto}
                  onChange={(e) => setValorTexto(e.target.value)}
                />
                <span className="dica">Para receber só uma parte, diminua este valor.</span>
              </div>

              <div className="campo largo">
                <label htmlFor="rc-obs">Observações</label>
                <textarea id="rc-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
              </div>
            </div>

            <div className="linha">
              <button className="botao-pequeno" type="submit">
                {salvando ? 'Salvando...' : editandoId ? 'Salvar correção' : 'Registrar recebimento'}
              </button>
              <button
                className="botao-pequeno secundario"
                type="button"
                onClick={() => {
                  setAberto(false)
                  setEditandoId(null)
                  setErro('')
                }}
              >
                Cancelar
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  )
}