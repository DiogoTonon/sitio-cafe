import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatarData, formatarMoeda, hojeISO, lerValor, numeroBR } from '../lib/formatar'

type Pagamento = {
  id: string
  data_pagamento: string
  valor: number
  forma_pagamento: string | null
  observacoes: string | null
}

type Props = {
  folhaId?: string
  servicoId?: string
  saldo: number
  cancelada: boolean
  textoQuitado?: string
  aoMudar: () => void
}

const FORMAS = ['Dinheiro', 'PIX', 'Transferência', 'Cheque', 'Outra']

const centavos = (n: number) => Math.round(n * 100)

function mensagemDeErro(e: { code?: string; message: string }) {
  if (e.code === 'P0001') return e.message
  if (e.code === '23514') return 'Algum campo está com valor inválido. Confira os valores e as datas.'
  return 'Não foi possível salvar. Verifique a internet e tente de novo.'
}

export default function PagamentosRh({
  folhaId,
  servicoId,
  saldo,
  cancelada,
  textoQuitado = 'Tudo já foi pago.',
  aoMudar,
}: Props) {
  const topoRef = useRef<HTMLElement>(null)
  const coluna = folhaId ? 'folha_id' : 'servico_id'
  const dono = (folhaId ?? servicoId) as string

  const [lista, setLista] = useState<Pagamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [data, setData] = useState(hojeISO())
  const [valorTexto, setValorTexto] = useState('')
  const [forma, setForma] = useState('')
  const [obs, setObs] = useState('')

  const carregar = useCallback(async () => {
    const { data: linhas, error } = await supabase
      .from('pagamentos_rh')
      .select('id, data_pagamento, valor, forma_pagamento, observacoes')
      .eq(coluna, dono)
      .order('data_pagamento', { ascending: false })
      .order('criado_em', { ascending: false })
    if (error) setErro('Não foi possível carregar os pagamentos. Recarregue a página.')
    else setLista(linhas)
    setCarregando(false)
  }, [coluna, dono])

  useEffect(() => {
    carregar()
  }, [carregar])

  const anterior = editandoId ? lista.find((p) => p.id === editandoId) : undefined
  const disponivel = (centavos(saldo) + (anterior ? centavos(anterior.valor) : 0)) / 100

  function falha(texto: string) {
    setErro(texto)
    topoRef.current?.scrollIntoView({ block: 'start' })
  }

  function abrirNovo() {
    setErro('')
    setAviso('')
    setEditandoId(null)
    setData(hojeISO())
    setValorTexto(numeroBR(saldo))
    setForma('')
    setObs('')
    setAberto(true)
  }

  function abrirEdicao(p: Pagamento) {
    setErro('')
    setAviso('')
    setEditandoId(p.id)
    setData(p.data_pagamento)
    setValorTexto(numeroBR(p.valor))
    setForma(p.forma_pagamento ?? '')
    setObs(p.observacoes ?? '')
    setAberto(true)
    topoRef.current?.scrollIntoView({ block: 'start' })
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')

    const valor = lerValor(valorTexto)
    if (valor === null || valor <= 0) {
      return falha('Digite o valor pago, maior que zero. Use vírgula para os centavos.')
    }
    if (centavos(valor) > centavos(disponivel)) {
      return falha(`O valor passa do que falta pagar. Você pode pagar no máximo ${formatarMoeda(disponivel)}.`)
    }
    if (data > hojeISO()) {
      return falha('A data do pagamento não pode ser no futuro. Registre no dia em que for pago.')
    }

    const dados = {
      [coluna]: dono,
      data_pagamento: data,
      valor,
      forma_pagamento: forma || null,
      observacoes: obs.trim() || null,
    }

    setSalvando(true)
    const resposta = editandoId
      ? await supabase.from('pagamentos_rh').update(dados).eq('id', editandoId).select('id')
      : await supabase.from('pagamentos_rh').insert(dados).select('id')
    setSalvando(false)

    if (resposta.error) return falha(mensagemDeErro(resposta.error))
    if (!resposta.data || resposta.data.length === 0) {
      return falha('Não foi possível salvar o pagamento.')
    }

    setAviso(editandoId ? 'Pagamento corrigido.' : 'Pagamento registrado.')
    setAberto(false)
    setEditandoId(null)
    await carregar()
    aoMudar()
  }

  async function excluir(p: Pagamento) {
    setErro('')
    setAviso('')
    const confirmou = window.confirm(
      `Excluir o pagamento de ${formatarMoeda(p.valor)} feito em ${formatarData(p.data_pagamento)}?\n\nO valor volta a ficar em aberto. A exclusão fica registrada no histórico.`,
    )
    if (!confirmou) return

    const { data: apagados, error } = await supabase
      .from('pagamentos_rh')
      .delete()
      .eq('id', p.id)
      .select('id')

    if (error) return falha(mensagemDeErro(error))
    if (!apagados || apagados.length === 0) return falha('Não foi possível excluir o pagamento.')

    setAviso('Pagamento excluído.')
    await carregar()
    aoMudar()
  }

  if (carregando) {
    return (
      <section className="bloco">
        <p>Carregando pagamentos...</p>
      </section>
    )
  }

  const quitada = centavos(saldo) <= 0

  return (
    <section className="bloco" ref={topoRef}>
      <h3>Pagamentos</h3>

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
        <p className="nota">Nenhum pagamento registrado ainda.</p>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>Data</th>
                <th className="num">Valor pago</th>
                <th>Forma</th>
                <th>Observações</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td>{formatarData(p.data_pagamento)}</td>
                  <td className="num">{formatarMoeda(p.valor)}</td>
                  <td>{p.forma_pagamento ?? '—'}</td>
                  <td>{p.observacoes ?? '—'}</td>
                  <td>
                    {!cancelada && (
                      <>
                        <button className="botao-texto" type="button" onClick={() => abrirEdicao(p)}>
                          Corrigir
                        </button>{' '}
                        <button className="botao-texto perigo" type="button" onClick={() => excluir(p)}>
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
            <p className="nota">{textoQuitado}</p>
          ) : (
            <button className="botao-pequeno" type="button" onClick={abrirNovo}>
              + Registrar pagamento
            </button>
          )}
        </div>
      )}

      {aberto && (
        <form onSubmit={salvar}>
          <fieldset className="sem-borda" disabled={salvando}>
            <h3>{editandoId ? 'Corrigir pagamento' : 'Novo pagamento'}</h3>
            <p className="nota">Ainda falta pagar até {formatarMoeda(disponivel)}.</p>

            <div className="grade">
              <div className="campo">
                <label htmlFor="prh-data">
                  Data do pagamento <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="prh-data"
                  type="date"
                  required
                  max={hojeISO()}
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>

              <div className="campo">
                <label htmlFor="prh-valor">
                  Valor pago (R$) <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="prh-valor"
                  type="text"
                  inputMode="decimal"
                  required
                  value={valorTexto}
                  onChange={(e) => setValorTexto(e.target.value)}
                />
                <span className="dica">Para pagar só uma parte, diminua este valor.</span>
              </div>

              <div className="campo">
                <label htmlFor="prh-forma">Forma de pagamento</label>
                <select id="prh-forma" value={forma} onChange={(e) => setForma(e.target.value)}>
                  <option value="">Não informada</option>
                  {FORMAS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div className="campo largo">
                <label htmlFor="prh-obs">Observações</label>
                <textarea id="prh-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
              </div>
            </div>

            <div className="linha">
              <button className="botao-pequeno" type="submit">
                {salvando ? 'Salvando...' : editandoId ? 'Salvar correção' : 'Registrar pagamento'}
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