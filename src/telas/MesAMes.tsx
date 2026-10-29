import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatarMoeda, hojeISO } from '../lib/formatar'

type Mes = { mes: number; recebido: number; pago: number }
type Forn = { nome: string; total: number; qtd: number }

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const m = (v: number | string) => formatarMoeda(Number(v))
const soma = (v: number[]) => v.reduce((t, x) => t + Math.round(Number(x) * 100), 0) / 100

export default function MesAMes() {
  const anoAtual = Number(hojeISO().slice(0, 4))
  const anos = Array.from({ length: 8 }, (_, i) => anoAtual + 1 - i)

  const [ano, setAno] = useState(anoAtual)
  const [meses, setMeses] = useState<Mes[]>([])
  const [forns, setForns] = useState<Forn[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      setCarregando(true)
      setErro('')
      const [a, b] = await Promise.all([
        supabase.rpc('relatorio_mensal', { p_ano: ano }),
        supabase.rpc('relatorio_fornecedores', { p_ano: ano }),
      ])
      if (cancelado) return
      if (a.error || b.error) {
        setErro('Não foi possível carregar o relatório. Verifique a internet e recarregue a página.')
        setMeses([])
        setForns([])
      } else {
        setMeses(a.data as unknown as Mes[])
        setForns(b.data as unknown as Forn[])
      }
      setCarregando(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [ano])

  const totRec = soma(meses.map((x) => x.recebido))
  const totPag = soma(meses.map((x) => x.pago))
  const maximo = Math.max(1, ...meses.flatMap((x) => [Number(x.recebido), Number(x.pago)]))
  const totForn = soma(forns.map((f) => f.total))

  return (
    <>
      <h2>Mês a mês e fornecedores</h2>
      <p>
        Dinheiro que realmente entrou e saiu em cada mês, e quanto foi pago a cada fornecedor no
        ano. Contas pendentes não entram.
      </p>

      <section className="bloco filtros">
        <div className="campo">
          <label htmlFor="mm-ano">Ano</label>
          <select id="mm-ano" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
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

      {carregando && meses.length === 0 ? (
        <p>Carregando relatório...</p>
      ) : meses.length > 0 ? (
        <>
          <h3>Mês a mês em {ano}</h3>
          {totRec === 0 && totPag === 0 && (
            <p className="nota">Não há recebimentos nem pagamentos em {ano}.</p>
          )}
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Mês</th>
                  <th className="num">Recebido</th>
                  <th className="num">Pago</th>
                  <th className="num">Diferença</th>
                  <th>Proporção (verde: recebido · marrom: pago)</th>
                </tr>
              </thead>
              <tbody>
                {meses.map((x) => (
                  <tr key={x.mes}>
                    <td>{MESES[x.mes - 1]}</td>
                    <td className="num">{m(x.recebido)}</td>
                    <td className="num">{m(x.pago)}</td>
                    <td className="num">{m(Math.round((Number(x.recebido) - Number(x.pago)) * 100) / 100)}</td>
                    <td>
                      <div className="barra-dupla">
                        <div className="barra-fina">
                          <div className="barra receber" style={{ width: `${Math.round((Number(x.recebido) / maximo) * 100)}%` }} />
                        </div>
                        <div className="barra-fina">
                          <div className="barra pagar" style={{ width: `${Math.round((Number(x.pago) / maximo) * 100)}%` }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="total">
                  <td>Total do ano</td>
                  <td className="num">{m(totRec)}</td>
                  <td className="num">{m(Math.round((totPag) * 100) / 100)}</td>
                  <td className="num">{m(Math.round((totRec - totPag) * 100) / 100)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="nota">
            O pago inclui contas, folha de funcionários, adiantamentos e temporários, no mês em que
            o pagamento foi feito.
          </p>

          <h3>Pago por fornecedor em {ano}</h3>
          {forns.length === 0 ? (
            <p className="nota">Nenhum pagamento de contas em {ano}.</p>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Fornecedor</th>
                    <th className="num">Pagamentos</th>
                    <th className="num">Total pago</th>
                    <th className="num">% do total</th>
                    <th>Proporção</th>
                  </tr>
                </thead>
                <tbody>
                  {forns.map((f, i) => {
                    const pct = totForn > 0 ? (Number(f.total) / totForn) * 100 : 0
                    return (
                      <tr key={f.nome}>
                        <td>{i + 1}</td>
                        <td>{f.nome}</td>
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
                    <td></td>
                    <td>Total</td>
                    <td className="num">{forns.reduce((t, f) => t + Number(f.qtd), 0)}</td>
                    <td className="num">{m(totForn)}</td>
                    <td className="num">100%</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="nota">
            Só pagamentos de contas a pagar. Não inclui funcionários nem adiantamentos. "Sem
            fornecedor" reúne contas em que o fornecedor não foi informado.
          </p>
        </>
      ) : null}
    </>
  )
}