
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatarData, formatarMoeda, hojeISO, lerValor, numeroBR } from '../lib/formatar'

type Fluxo = {
  ano: number
  recebido_total: number
  pago_total: number
  diferenca: number
  pago_contas: number
  pago_folha: number
  adiantamentos: number
  pago_temporarios: number
  juros_pagos: number
  multas_pagas: number
  ajustes: number
  encargos_avulsos: number
  recebido_por_tipo: { nome: string; valor: number }[]
  pago_por_categoria: { nome: string; total: number; juros_multas: number; encargos: boolean }[]
  saldo_inicial_informado: number | null
  data_saldo_inicial: string | null
  saldo_inicial_ano: number | null
  saldo_final: number | null
}

type Forma = { forma: string; total: number; qtd: number }

const m = (v: number | null | undefined) => formatarMoeda(Number(v ?? 0))

export default function FluxoCaixa() {
  const anoAtual = Number(hojeISO().slice(0, 4))
  const anos = Array.from({ length: 8 }, (_, i) => anoAtual + 1 - i)

  const [ano, setAno] = useState(anoAtual)
  const [versao, setVersao] = useState(0)
  const [fluxo, setFluxo] = useState<Fluxo | null>(null)
  const [formas, setFormas] = useState<Forma[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const [formAberto, setFormAberto] = useState(false)
  const [valorTxt, setValorTxt] = useState('')
  const [dataSaldo, setDataSaldo] = useState('')
  const [erroForm, setErroForm] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      setCarregando(true)
      setErro('')
      const [r, f] = await Promise.all([
        supabase.rpc('relatorio_fluxo', { p_ano: ano }),
        supabase.rpc('relatorio_formas', { p_ano: ano }),
      ])
      if (cancelado) return
      if (r.error || f.error) {
        setErro('Não foi possível carregar o relatório. Verifique a internet e recarregue a página.')
        setFluxo(null)
        setFormas([])
      } else {
        setFluxo(r.data as unknown as Fluxo)
        setFormas(f.data as unknown as Forma[])
      }
      setCarregando(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [ano, versao])

  function abrirForm() {
    setErroForm('')
    setAviso('')
    setValorTxt(fluxo?.saldo_inicial_informado != null ? numeroBR(fluxo.saldo_inicial_informado) : '')
    setDataSaldo(fluxo?.data_saldo_inicial ?? `${ano}-01-01`)
    setFormAberto(true)
  }

  async function salvarSaldo(evento: FormEvent) {
    evento.preventDefault()
    setErroForm('')
    const valor = lerValor(valorTxt)
    if (valor === null) {
      setErroForm('Digite o saldo em reais, por exemplo 10.000,00. Use vírgula para os centavos.')
      return
    }
    if (!dataSaldo) {
      setErroForm('Informe a data a que esse saldo se refere.')
      return
    }
    setSalvando(true)
    const { data, error } = await supabase
      .from('configuracoes')
      .update({ saldo_inicial: valor, data_saldo_inicial: dataSaldo })
      .eq('id', 1)
      .select('id')
    setSalvando(false)
    if (error || !data || data.length === 0) {
      setErroForm('Não foi possível salvar o saldo. Tente de novo.')
      return
    }
    setFormAberto(false)
    setAviso('Saldo inicial salvo.')
    setVersao((v) => v + 1)
  }

  async function removerSaldo() {
    const ok = window.confirm(
      'Remover o saldo inicial?\n\nOs relatórios deixam de mostrar o saldo final. Nenhuma movimentação é apagada.',
    )
    if (!ok) return
    setErroForm('')
    setSalvando(true)
    const { data, error } = await supabase
      .from('configuracoes')
      .update({ saldo_inicial: null, data_saldo_inicial: null })
      .eq('id', 1)
      .select('id')
    setSalvando(false)
    if (error || !data || data.length === 0) {
      setErroForm('Não foi possível remover o saldo. Tente de novo.')
      return
    }
    setFormAberto(false)
    setAviso('Saldo inicial removido.')
    setVersao((v) => v + 1)
  }

  const semMovimento = fluxo !== null && Number(fluxo.recebido_total) === 0 && Number(fluxo.pago_total) === 0
  const dataSaldoNoAno =
    fluxo?.data_saldo_inicial != null && fluxo.data_saldo_inicial >= `${ano}-01-01`

  return (
    <>
      <h2>Fluxo de caixa</h2>
      <p>
        Mostra o dinheiro que <strong>realmente entrou e saiu</strong> no ano: recebimentos pela
        data em que foram recebidos e pagamentos pela data em que foram pagos. Contas pendentes não
        entram aqui.
      </p>

      <section className="bloco filtros">
        <div className="campo">
          <label htmlFor="fc-ano">Ano</label>
          <select id="fc-ano" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </section>

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

      {carregando && !fluxo ? (
        <p>Carregando relatório...</p>
      ) : fluxo ? (
        <>
          {semMovimento && (
            <p className="bloco">
              Não há recebimentos nem pagamentos registrados em {ano}. Nenhum valor é estimado: assim
              que houver movimentações, elas aparecem aqui.
            </p>
          )}

          <div className="cards">
            <div className="card">
              <span className="rotulo">Total recebido em {ano}</span>
              <strong>{m(fluxo.recebido_total)}</strong>
            </div>
            <div className="card">
              <span className="rotulo">Total pago em {ano}</span>
              <strong>{m(fluxo.pago_total)}</strong>
            </div>
            <div className="card">
              <span className="rotulo">Diferença (recebido − pago)</span>
              <strong>{m(fluxo.diferenca)}</strong>
              <span className="dica">
                {Number(fluxo.diferenca) < 0
                  ? 'Saiu mais dinheiro do que entrou.'
                  : 'Entrou mais dinheiro do que saiu.'}
              </span>
            </div>
          </div>

          <h3>Saldo</h3>
          {fluxo.saldo_final != null ? (
            <div className="cards">
              <div className="card">
                <span className="rotulo">
                  {dataSaldoNoAno
                    ? `Saldo inicial (informado em ${formatarData(fluxo.data_saldo_inicial)})`
                    : `Saldo calculado em 01/01/${ano}`}
                </span>
                <strong>{m(fluxo.saldo_inicial_ano)}</strong>
              </div>
              <div className="card">
                <span className="rotulo">Saldo final em 31/12/{ano}</span>
                <strong>{m(fluxo.saldo_final)}</strong>
                <span className="dica">Saldo inicial + recebimentos − pagamentos.</span>
              </div>
            </div>
          ) : fluxo.saldo_inicial_informado != null ? (
            <p className="nota">
              O saldo inicial informado é de {formatarData(fluxo.data_saldo_inicial)}, depois do fim
              de {ano}. Por isso não há saldo para este ano.
            </p>
          ) : (
            <p className="nota">
              Nenhum saldo inicial foi informado, então o saldo final não é calculado. Se quiser ver
              o saldo, informe quanto havia em caixa em uma data.
            </p>
          )}
          {dataSaldoNoAno && fluxo.data_saldo_inicial !== `${ano}-01-01` && fluxo.saldo_final != null && (
            <p className="nota">
              Movimentações anteriores à data do saldo inicial não entram no cálculo do saldo.
            </p>
          )}

          {fluxo.saldo_inicial_informado != null && (
            <p className="nota">
              Saldo inicial informado: {m(fluxo.saldo_inicial_informado)} em{' '}
              {formatarData(fluxo.data_saldo_inicial)}.
            </p>
          )}

          {!formAberto ? (
            <div className="linha">
              <button className="botao-pequeno secundario" type="button" onClick={abrirForm}>
                {fluxo.saldo_inicial_informado != null ? 'Alterar saldo inicial' : 'Informar saldo inicial'}
              </button>
            </div>
          ) : (
            <form className="bloco" onSubmit={salvarSaldo}>
              <fieldset className="sem-borda" disabled={salvando}>
                <h3>Saldo inicial</h3>
                <p className="nota">
                  Informe quanto dinheiro havia em caixa no começo da data escolhida. O sistema soma
                  as movimentações dessa data em diante.
                </p>
                {erroForm && (
                  <p className="erro" role="alert">
                    {erroForm}
                  </p>
                )}
                <div className="grade">
                  <div className="campo">
                    <label htmlFor="sa-valor">
                      Saldo em caixa (R$) <span className="obrig">(obrigatório)</span>
                    </label>
                    <input
                      id="sa-valor"
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex.: 10.000,00"
                      value={valorTxt}
                      onChange={(e) => setValorTxt(e.target.value)}
                    />
                  </div>
                  <div className="campo">
                    <label htmlFor="sa-data">
                      Nesta data <span className="obrig">(obrigatório)</span>
                    </label>
                    <input
                      id="sa-data"
                      type="date"
                      value={dataSaldo}
                      onChange={(e) => setDataSaldo(e.target.value)}
                    />
                  </div>
                </div>
                <div className="linha">
                  <button className="botao-pequeno" type="submit">
                    {salvando ? 'Salvando...' : 'Salvar saldo'}
                  </button>
                  <button
                    className="botao-pequeno secundario"
                    type="button"
                    onClick={() => setFormAberto(false)}
                  >
                    Cancelar
                  </button>
                  {fluxo.saldo_inicial_informado != null && (
                    <button className="botao-texto perigo" type="button" onClick={removerSaldo}>
                      Remover saldo inicial
                    </button>
                  )}
                </div>
              </fieldset>
            </form>
          )}

          <h3>Recebido por tipo de receita</h3>
          {fluxo.recebido_por_tipo.length === 0 ? (
            <p className="nota">Nenhum recebimento em {ano}.</p>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Tipo de receita</th>
                    <th className="num">Recebido</th>
                  </tr>
                </thead>
                <tbody>
                  {fluxo.recebido_por_tipo.map((t) => (
                    <tr key={t.nome}>
                      <td>{t.nome}</td>
                      <td className="num">{m(t.valor)}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total recebido</td>
                    <td className="num">{m(fluxo.recebido_total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <h3>Pago por categoria</h3>
          {Number(fluxo.pago_total) === 0 ? (
            <p className="nota">Nenhum pagamento em {ano}.</p>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Categoria</th>
                    <th className="num">Total pago</th>
                    <th className="num">Dos quais juros e multas</th>
                  </tr>
                </thead>
                <tbody>
                  {fluxo.pago_por_categoria.map((c) => (
                    <tr key={c.nome}>
                      <td>
                        {c.nome}
                        {c.encargos && <span className="sub-nota">Despesas avulsas de juros e multas</span>}
                      </td>
                      <td className="num">{m(c.total)}</td>
                      <td className="num">
                        {c.encargos ? m(c.total) : Number(c.juros_multas) > 0 ? m(c.juros_multas) : '—'}
                      </td>
                    </tr>
                  ))}
                  {(Number(fluxo.pago_folha) > 0 || Number(fluxo.adiantamentos) > 0) && (
                    <tr>
                      <td>
                        Funcionários fixos
                        <span className="sub-nota">
                          Pagamentos da folha {m(fluxo.pago_folha)} + adiantamentos {m(fluxo.adiantamentos)}
                        </span>
                      </td>
                      <td className="num">{m(Number(fluxo.pago_folha) + Number(fluxo.adiantamentos))}</td>
                      <td className="num">—</td>
                    </tr>
                  )}
                  {Number(fluxo.pago_temporarios) > 0 && (
                    <tr>
                      <td>Funcionários temporários</td>
                      <td className="num">{m(fluxo.pago_temporarios)}</td>
                      <td className="num">—</td>
                    </tr>
                  )}
                  <tr className="total">
                    <td>Total pago</td>
                    <td className="num">{m(fluxo.pago_total)}</td>
                    <td className="num">
                      {m(Number(fluxo.juros_pagos) + Number(fluxo.multas_pagas) + Number(fluxo.encargos_avulsos))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <h3>Pago por forma de pagamento</h3>
          {formas.length === 0 ? (
            <p className="nota">Nenhum pagamento em {ano}.</p>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Forma de pagamento</th>
                    <th className="num">Pagamentos</th>
                    <th className="num">Total pago</th>
                    <th className="num">% do total</th>
                    <th>Proporção</th>
                  </tr>
                </thead>
                <tbody>
                  {formas.map((f) => {
                    const pct = Number(fluxo.pago_total) > 0
                      ? (Number(f.total) / Number(fluxo.pago_total)) * 100
                      : 0
                    return (
                      <tr key={f.forma}>
                        <td>{f.forma}</td>
                        <td className="num">{f.qtd}</td>
                        <td className="num">{m(f.total)}</td>
                        <td className="num">{pct.toFixed(1).replace('.', ',')}%</td>
                        <td>
                          <div className="barra-trilho">
                            <div className="barra pagar" style={{ width: `${Math.round(pct)}%` }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  <tr className="total">
                    <td>Total pago</td>
                    <td className="num">{formas.reduce((t, f) => t + Number(f.qtd), 0)}</td>
                    <td className="num">{m(fluxo.pago_total)}</td>
                    <td className="num">100%</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="nota">
            Usa a forma registrada em cada pagamento. Pagamentos sem forma informada aparecem como
            "Não informada".
          </p>

          <h3>Juros e multas pagos em {ano}</h3>
          <div className="cards">
            <div className="card">
              <span className="rotulo">Juros pagos</span>
              <strong>{m(fluxo.juros_pagos)}</strong>
            </div>
            <div className="card">
              <span className="rotulo">Multas pagas</span>
              <strong>{m(fluxo.multas_pagas)}</strong>
            </div>
            <div className="card">
              <span className="rotulo">Despesas avulsas de juros e multas</span>
              <strong>{m(fluxo.encargos_avulsos)}</strong>
            </div>
            <div className="card">
              <span className="rotulo">Total de juros e multas</span>
              <strong>
                {m(Number(fluxo.juros_pagos) + Number(fluxo.multas_pagas) + Number(fluxo.encargos_avulsos))}
              </strong>
            </div>
          </div>
          <p className="nota">
            Esses valores já estão incluídos no total pago. Só entram juros e multas que foram
            efetivamente pagos, nunca os estimados.
            {Number(fluxo.ajustes) !== 0 &&
              ` Diferenças entre o valor calculado e o valor pago (ajustes): ${m(fluxo.ajustes)}.`}
          </p>
        </>
      ) : null}
    </>
  )
}
