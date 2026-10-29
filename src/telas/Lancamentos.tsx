import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatarMoeda, hojeISO } from '../lib/formatar'

type Canc = { canceladas_valor: number; canceladas_qtd: number }
type Lanc = {
  ano: number
  receitas: { registradas: number; recebidas: number; pendentes: number } & Canc
  contas: {
    registradas: number
    pagas_principal: number
    pendentes: number
    juros: number
    multas: number
    ajustes: number
  } & Canc
  folha: { custo: number; pago: number; pendente: number } & Canc
  temporarios: { total: number; pago: number; pendente: number } & Canc
  despesas_registradas: number
  despesas_pagas: number
  despesas_pendentes: number
  resultado: number
}

const m = (v: number | string | null | undefined) => formatarMoeda(Number(v ?? 0))

export default function Lancamentos() {
  const anoAtual = Number(hojeISO().slice(0, 4))
  const anos = Array.from({ length: 8 }, (_, i) => anoAtual + 1 - i)

  const [ano, setAno] = useState(anoAtual)
  const [rel, setRel] = useState<Lanc | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      setCarregando(true)
      setErro('')
      const { data, error } = await supabase.rpc('relatorio_lancamentos', { p_ano: ano })
      if (cancelado) return
      if (error) {
        setErro('Não foi possível carregar o relatório. Verifique a internet e recarregue a página.')
        setRel(null)
      } else {
        setRel(data as unknown as Lanc)
      }
      setCarregando(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [ano])

  const canceladas = rel
    ? [
        { nome: 'Receitas', qtd: rel.receitas.canceladas_qtd, valor: rel.receitas.canceladas_valor },
        { nome: 'Contas a pagar', qtd: rel.contas.canceladas_qtd, valor: rel.contas.canceladas_valor },
        { nome: 'Folhas de funcionários', qtd: rel.folha.canceladas_qtd, valor: rel.folha.canceladas_valor },
        { nome: 'Temporários', qtd: rel.temporarios.canceladas_qtd, valor: rel.temporarios.canceladas_valor },
      ].filter((c) => Number(c.qtd) > 0)
    : []

  const semDados =
    rel !== null &&
    Number(rel.receitas.registradas) === 0 &&
    Number(rel.despesas_registradas) === 0 &&
    canceladas.length === 0

  const jm = rel ? Number(rel.contas.juros) + Number(rel.contas.multas) : 0
  const ajustes = rel ? Number(rel.contas.ajustes) : 0

  return (
    <>
      <h2>Receitas e despesas lançadas</h2>
      <p>
        Mostra tudo o que foi <strong>registrado</strong> no ano, inclusive o que ainda está
        pendente. Em cada linha, o valor é dividido entre o que <strong>já foi pago ou recebido</strong>{' '}
        e o que <strong>ainda falta</strong>. Contas canceladas ficam fora dos totais.
      </p>

      <section className="bloco filtros">
        <div className="campo">
          <label htmlFor="la-ano">Ano</label>
          <select id="la-ano" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </section>

      <p className="nota">
        Cada lançamento entra no ano do seu <strong>mês de referência</strong>. Se ele não foi
        informado, vale o vencimento (despesas), a data prevista (receitas, e, se faltar, a data do
        lançamento), o mês da folha ou o último dia trabalhado (temporários).
      </p>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {carregando && !rel ? (
        <p>Carregando relatório...</p>
      ) : rel ? (
        <>
          {semDados && (
            <p className="bloco">
              Não há lançamentos em {ano}. Nenhum valor é estimado: assim que houver, eles aparecem
              aqui.
            </p>
          )}

          <div className="cards">
            <div className="card">
              <span className="rotulo">Receitas registradas em {ano}</span>
              <strong>{m(rel.receitas.registradas)}</strong>
            </div>
            <div className="card">
              <span className="rotulo">Despesas registradas em {ano}</span>
              <strong>{m(rel.despesas_registradas)}</strong>
            </div>
            <div className="card">
              <span className="rotulo">Resultado dos lançamentos</span>
              <strong>{m(rel.resultado)}</strong>
              <span className="dica">Receitas registradas − despesas registradas.</span>
            </div>
          </div>
          <p className="nota">
            Este resultado soma o que foi lançado, inclusive o que ainda não foi pago ou recebido. Ele
            não é o lucro contábil definitivo.
          </p>

          <h3>Receitas</h3>
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th></th>
                  <th className="num">Registradas</th>
                  <th className="num">Já recebidas</th>
                  <th className="num">Ainda a receber</th>
                </tr>
              </thead>
              <tbody>
                <tr className="total">
                  <td>Receitas</td>
                  <td className="num">{m(rel.receitas.registradas)}</td>
                  <td className="num">{m(rel.receitas.recebidas)}</td>
                  <td className="num">{m(rel.receitas.pendentes)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>Despesas</h3>
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Despesa</th>
                  <th className="num">Registradas</th>
                  <th className="num">Já pagas</th>
                  <th className="num">Ainda a pagar</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    Contas a pagar
                    <span className="sub-nota">Valor original das contas</span>
                  </td>
                  <td className="num">{m(rel.contas.registradas)}</td>
                  <td className="num">{m(rel.contas.pagas_principal)}</td>
                  <td className="num">{m(rel.contas.pendentes)}</td>
                </tr>
                {jm !== 0 && (
                  <tr>
                    <td>
                      Juros e multas pagos
                      <span className="sub-nota">Só os efetivamente pagos</span>
                    </td>
                    <td className="num">{m(jm)}</td>
                    <td className="num">{m(jm)}</td>
                    <td className="num">—</td>
                  </tr>
                )}
                {ajustes !== 0 && (
                  <tr>
                    <td>
                      Ajustes nos pagamentos
                      <span className="sub-nota">Diferença entre o valor calculado e o pago</span>
                    </td>
                    <td className="num">{m(ajustes)}</td>
                    <td className="num">{m(ajustes)}</td>
                    <td className="num">—</td>
                  </tr>
                )}
                <tr>
                  <td>
                    Funcionários fixos
                    <span className="sub-nota">Salário + horas extras − descontos</span>
                  </td>
                  <td className="num">{m(rel.folha.custo)}</td>
                  <td className="num">{m(rel.folha.pago)}</td>
                  <td className="num">{m(rel.folha.pendente)}</td>
                </tr>
                <tr>
                  <td>Funcionários temporários</td>
                  <td className="num">{m(rel.temporarios.total)}</td>
                  <td className="num">{m(rel.temporarios.pago)}</td>
                  <td className="num">{m(rel.temporarios.pendente)}</td>
                </tr>
                <tr className="total">
                  <td>Total das despesas</td>
                  <td className="num">{m(rel.despesas_registradas)}</td>
                  <td className="num">{m(rel.despesas_pagas)}</td>
                  <td className="num">{m(rel.despesas_pendentes)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="nota">
            O valor "ainda a pagar" é só o que falta do valor principal. Juros e multas estimados
            nunca entram. Nas folhas, os adiantamentos já entregues contam como pagos.
          </p>

          <h3>Cancelados (fora dos totais)</h3>
          {canceladas.length === 0 ? (
            <p className="nota">Nenhum lançamento cancelado em {ano}.</p>
          ) : (
            <div className="tabela-rolagem">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th className="num">Quantidade</th>
                    <th className="num">Valor que seria</th>
                  </tr>
                </thead>
                <tbody>
                  {canceladas.map((c) => (
                    <tr key={c.nome}>
                      <td>{c.nome}</td>
                      <td className="num">{c.qtd}</td>
                      <td className="num">{m(c.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </>
  )
}