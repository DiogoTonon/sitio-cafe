import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatarData, formatarMoeda, hojeISO, lerValor, numeroBR } from '../lib/formatar'

type Pagamento = {
  id: string
  data_pagamento: string
  valor_principal: number
  juros: number
  multa: number
  valor_calculado: number
  valor_pago: number
  ajuste: number
  justificativa_ajuste: string | null
  forma_pagamento: string | null
  observacoes: string | null
}

type Props = {
  contaId: string
  categoriaId: string
  saldoPrincipal: number
  cancelada: boolean
  aoMudar: () => void
}

const FORMAS = ['Dinheiro', 'PIX', 'Boleto', 'Transferência', 'Cartão', 'Cheque', 'Outra']

const centavos = (n: number) => Math.round(n * 100)

// Campo opcional: vazio vale zero; texto inválido vira null.
function opcional(texto: string) {
  return texto.trim() === '' ? 0 : lerValor(texto)
}

function mensagemDeErro(e: { code?: string; message: string }) {
  if (e.code === 'P0001') return e.message
  if (e.code === '23514') return 'Algum campo está com valor inválido. Confira os valores e as datas.'
  return 'Não foi possível salvar. Verifique a internet e tente de novo.'
}

export default function Pagamentos({ contaId, categoriaId, saldoPrincipal, cancelada, aoMudar }: Props) {
  const topoRef = useRef<HTMLElement>(null)

  const [lista, setLista] = useState<Pagamento[]>([])
  const [encargos, setEncargos] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [aberto, setAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [data, setData] = useState(hojeISO())
  const [principal, setPrincipal] = useState('')
  const [juros, setJuros] = useState('')
  const [multa, setMulta] = useState('')
  const [pagoEditado, setPagoEditado] = useState<string | null>(null)
  const [justificativa, setJustificativa] = useState('')
  const [forma, setForma] = useState('')
  const [obs, setObs] = useState('')

  const carregar = useCallback(async () => {
    const [p, c] = await Promise.all([
      supabase
        .from('pagamentos')
        .select('*')
        .eq('conta_id', contaId)
        .order('data_pagamento', { ascending: false })
        .order('criado_em', { ascending: false }),
      supabase.from('categorias').select('eh_encargos').eq('id', categoriaId).maybeSingle(),
    ])
    if (p.error) setErro('Não foi possível carregar os pagamentos. Recarregue a página.')
    else setLista(p.data)
    setEncargos(c.data?.eh_encargos === true)
    setCarregando(false)
  }, [contaId, categoriaId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const vPrincipal = lerValor(principal)
  const vJuros = encargos ? 0 : opcional(juros)
  const vMulta = encargos ? 0 : opcional(multa)
  const calculado =
    vPrincipal !== null && vJuros !== null && vMulta !== null
      ? (centavos(vPrincipal) + centavos(vJuros) + centavos(vMulta)) / 100
      : null
  const pagoTexto = pagoEditado ?? (calculado !== null ? numeroBR(calculado) : '')
  const vPago = lerValor(pagoTexto)
  const diferenca =
    calculado !== null && vPago !== null ? (centavos(vPago) - centavos(calculado)) / 100 : 0
  const precisaJustificar = calculado !== null && vPago !== null && diferenca !== 0

  const anterior = editandoId ? lista.find((p) => p.id === editandoId) : undefined
  const disponivel =
    (centavos(saldoPrincipal) + (anterior ? centavos(anterior.valor_principal) : 0)) / 100

  function falha(texto: string) {
    setErro(texto)
    topoRef.current?.scrollIntoView({ block: 'start' })
  }

  function abrirNovo() {
    setErro('')
    setAviso('')
    setEditandoId(null)
    setData(hojeISO())
    setPrincipal(numeroBR(saldoPrincipal))
    setJuros('')
    setMulta('')
    setPagoEditado(null)
    setJustificativa('')
    setForma('')
    setObs('')
    setAberto(true)
  }

  function abrirEdicao(p: Pagamento) {
    setErro('')
    setAviso('')
    setEditandoId(p.id)
    setData(p.data_pagamento)
    setPrincipal(numeroBR(p.valor_principal))
    setJuros(Number(p.juros) ? numeroBR(p.juros) : '')
    setMulta(Number(p.multa) ? numeroBR(p.multa) : '')
    setPagoEditado(numeroBR(p.valor_pago))
    setJustificativa(p.justificativa_ajuste ?? '')
    setForma(p.forma_pagamento ?? '')
    setObs(p.observacoes ?? '')
    setAberto(true)
    topoRef.current?.scrollIntoView({ block: 'start' })
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')

    if (vPrincipal === null || vPrincipal <= 0) {
      return falha('Digite o valor principal pago, maior que zero. Use vírgula para os centavos.')
    }
    if (vJuros === null || vMulta === null) {
      return falha('Juros e multa: digite um valor válido (ex.: 25,00) ou deixe em branco.')
    }
    if (centavos(vPrincipal) > centavos(disponivel)) {
      return falha(
        `O valor principal passa do que falta pagar. Você pode pagar no máximo ${formatarMoeda(disponivel)} do valor principal.`,
      )
    }
    if (vPago === null || vPago <= 0) {
      return falha('Digite o valor que realmente saiu do caixa, maior que zero.')
    }
    if (precisaJustificar && justificativa.trim() === '') {
      return falha('O valor pago é diferente do valor calculado. Explique o motivo da diferença.')
    }
    if (data > hojeISO()) {
      return falha('A data do pagamento não pode ser no futuro. Registre no dia em que for pago.')
    }

    const dados = {
      conta_id: contaId,
      data_pagamento: data,
      valor_principal: vPrincipal,
      juros: vJuros,
      multa: vMulta,
      valor_pago: vPago,
      justificativa_ajuste: precisaJustificar ? justificativa.trim() : null,
      forma_pagamento: forma || null,
      observacoes: obs.trim() || null,
    }

    setSalvando(true)
    const resposta = editandoId
      ? await supabase.from('pagamentos').update(dados).eq('id', editandoId).select('id')
      : await supabase.from('pagamentos').insert(dados).select('id')
    setSalvando(false)

    if (resposta.error) return falha(mensagemDeErro(resposta.error))
    if (!resposta.data || resposta.data.length === 0) {
      return falha('Não foi possível salvar o pagamento.')
    }

    setAberto(false)
    setEditandoId(null)
    setAviso(editandoId ? 'Pagamento corrigido.' : 'Pagamento registrado.')
    await carregar()
    aoMudar()
  }

  async function excluir(p: Pagamento) {
    setErro('')
    setAviso('')
    const confirmou = window.confirm(
      `Excluir o pagamento de ${formatarMoeda(p.valor_pago)} feito em ${formatarData(p.data_pagamento)}?\n\nA conta volta a ter esse valor em aberto. A exclusão fica registrada no histórico.`,
    )
    if (!confirmou) return

    const { data: apagados, error } = await supabase
      .from('pagamentos')
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

  const quitada = centavos(saldoPrincipal) <= 0

  return (
    <section className="bloco" ref={topoRef}>
      <h2>Pagamentos</h2>

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
                <th className="num">Principal</th>
                <th className="num">Juros</th>
                <th className="num">Multa</th>
                <th className="num">Valor pago</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td>{formatarData(p.data_pagamento)}</td>
                  <td className="num">{formatarMoeda(p.valor_principal)}</td>
                  <td className="num">{formatarMoeda(p.juros)}</td>
                  <td className="num">{formatarMoeda(p.multa)}</td>
                  <td className="num">
                    {formatarMoeda(p.valor_pago)}
                    {Number(p.ajuste) !== 0 && (
                      <span className="sub-nota">
                        Ajuste de {formatarMoeda(p.ajuste)}: {p.justificativa_ajuste}
                      </span>
                    )}
                  </td>
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
            <p className="nota">Esta conta está totalmente paga.</p>
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
            <p className="nota">
              Você pode pagar até {formatarMoeda(disponivel)} do valor principal desta conta.
            </p>

            <div className="grade">
              <div className="campo">
                <label htmlFor="pg-data">
                  Data do pagamento <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="pg-data"
                  type="date"
                  required
                  max={hojeISO()}
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>

              <div className="campo">
                <label htmlFor="pg-principal">
                  Valor principal pago (R$) <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="pg-principal"
                  type="text"
                  inputMode="decimal"
                  required
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                />
                <span className="dica">Para pagar só uma parte, diminua este valor.</span>
              </div>

              {encargos ? (
                <p className="nota largo">
                  Esta despesa já é de juros e multas. Não preencha juros nem multa aqui.
                </p>
              ) : (
                <>
                  <div className="campo">
                    <label htmlFor="pg-juros">Juros (R$)</label>
                    <input
                      id="pg-juros"
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={juros}
                      onChange={(e) => setJuros(e.target.value)}
                    />
                  </div>
                  <div className="campo">
                    <label htmlFor="pg-multa">Multa (R$)</label>
                    <input
                      id="pg-multa"
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={multa}
                      onChange={(e) => setMulta(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="campo largo">
                <div className="resumo-calculo">
                  Total calculado (principal + juros + multa):{' '}
                  {calculado !== null ? formatarMoeda(calculado) : '—'}
                </div>
              </div>

              <div className="campo">
                <label htmlFor="pg-pago">
                  Valor que realmente saiu do caixa (R$) <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="pg-pago"
                  type="text"
                  inputMode="decimal"
                  required
                  value={pagoTexto}
                  onChange={(e) => setPagoEditado(e.target.value)}
                />
                {pagoEditado !== null && (
                  <button className="botao-texto" type="button" onClick={() => setPagoEditado(null)}>
                    Usar o valor calculado
                  </button>
                )}
              </div>

              <div className="campo">
                <label htmlFor="pg-forma">Forma de pagamento</label>
                <select id="pg-forma" value={forma} onChange={(e) => setForma(e.target.value)}>
                  <option value="">Não informada</option>
                  {FORMAS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              {precisaJustificar && (
                <div className="campo largo">
                  <label htmlFor="pg-just">
                    Por que o valor pago é diferente do calculado?{' '}
                    <span className="obrig">(obrigatório)</span>
                  </label>
                  <textarea
                    id="pg-just"
                    rows={2}
                    value={justificativa}
                    onChange={(e) => setJustificativa(e.target.value)}
                  />
                  <span className="dica">
                    Diferença de {formatarMoeda(diferenca)}. Ela será guardada como ajuste, sem alterar
                    o valor original da conta.
                  </span>
                </div>
              )}

              <div className="campo largo">
                <label htmlFor="pg-obs">Observações</label>
                <textarea id="pg-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
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