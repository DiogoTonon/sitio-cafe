import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatarMoeda, hojeISO } from '../lib/formatar'
import { baixarXlsx, type Celula } from '../lib/planilha'

type Linha = { categoria: string; subcategoria: string; total: number; qtd: number }
type Cat = { id: string; nome: string }
type Sub = { id: string; nome: string; categoria_id: string }

const m = (v: number | string) => formatarMoeda(Number(v))
const soma = (v: number[]) => v.reduce((t, x) => t + Math.round(Number(x) * 100), 0) / 100

export default function PorCategoria() {
  const anoAtual = Number(hojeISO().slice(0, 4))
  const anos = Array.from({ length: 8 }, (_, i) => anoAtual + 1 - i)

  const [ano, setAno] = useState(anoAtual)
  const [categoria, setCategoria] = useState('')
  const [subcategoria, setSubcategoria] = useState('')
  const [cats, setCats] = useState<Cat[]>([])
  const [subs, setSubs] = useState<Sub[]>([])
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    async function listas() {
      const [a, b] = await Promise.all([
        supabase.from('categorias').select('id, nome').order('nome'),
        supabase.from('subcategorias').select('id, nome, categoria_id').order('nome'),
      ])
      if (!a.error && a.data) setCats(a.data as unknown as Cat[])
      if (!b.error && b.data) setSubs(b.data as unknown as Sub[])
    }
    listas()
  }, [])

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      setCarregando(true)
      setErro('')
      const r = await supabase.rpc('relatorio_subcategorias', {
        p_ano: ano,
        p_categoria: categoria || null,
        p_subcategoria: subcategoria || null,
      })
      if (cancelado) return
      if (r.error) {
        setErro('Não foi possível carregar o relatório. Verifique a internet e recarregue a página.')
        setLinhas([])
      } else {
        setLinhas(r.data as unknown as Linha[])
      }
      setCarregando(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [ano, categoria, subcategoria])

  const subsDaCategoria = subs.filter((s) => s.categoria_id === categoria)
  const totalGeral = soma(linhas.map((l) => l.total))

  // Agrupa por categoria para mostrar o subtotal de cada uma.
  const grupos: { nome: string; itens: Linha[] }[] = []
  for (const l of linhas) {
    const g = grupos.find((x) => x.nome === l.categoria)
    if (g) g.itens.push(l)
    else grupos.push({ nome: l.categoria, itens: [l] })
  }

  async function baixar() {
    const dados: Celula[][] = linhas.map((l) => [
      l.categoria,
      l.subcategoria,
      Number(l.qtd),
      Number(l.total),
    ])
    dados.push(['Total', '', linhas.reduce((t, l) => t + Number(l.qtd), 0), totalGeral])
    await baixarXlsx(
      `gastos-por-categoria-${ano}.xlsx`,
      'Por categoria',
      [
        { titulo: 'Categoria', tipo: 'texto' },
        { titulo: 'Subcategoria', tipo: 'texto' },
        { titulo: 'Pagamentos', tipo: 'qtd' },
        { titulo: 'Total pago', tipo: 'din' },
      ],
      dados,
    )
  }

  return (
    <>
      <h2>Gastos por categoria e subcategoria</h2>
      <p>
        Quanto foi pago em cada categoria e subcategoria, no mês em que o pagamento foi feito.
        Contas pendentes não entram.
      </p>

      <section className="bloco filtros nao-imprimir">
        <div className="campo">
          <label htmlFor="pc-ano">Ano</label>
          <select id="pc-ano" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="pc-cat">Categoria</label>
          <select
            id="pc-cat"
            value={categoria}
            onChange={(e) => {
              setCategoria(e.target.value)
              setSubcategoria('')
            }}
          >
            <option value="">Todas</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="pc-sub">Subcategoria</label>
          <select
            id="pc-sub"
            value={subcategoria}
            onChange={(e) => setSubcategoria(e.target.value)}
            disabled={!categoria}
          >
            <option value="">{categoria ? 'Todas' : 'Escolha uma categoria'}</option>
            {subsDaCategoria.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
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

      {carregando && linhas.length === 0 ? (
        <p>Carregando relatório...</p>
      ) : linhas.length === 0 ? (
        !erro && <p className="nota">Nenhum pagamento de contas encontrado com esses filtros em {ano}.</p>
      ) : (
        <>
          <p className="nao-imprimir">
            <button type="button" onClick={baixar}>
              Baixar em Excel
            </button>
          </p>
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Categoria / subcategoria</th>
                  <th className="num">Pagamentos</th>
                  <th className="num">Total pago</th>
                  <th className="num">% do total</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => {
                  const subtotal = soma(g.itens.map((i) => i.total))
                  const pctCat = totalGeral > 0 ? (subtotal / totalGeral) * 100 : 0
                  return (
                    <>
                      <tr key={g.nome} className="total">
                        <td>{g.nome}</td>
                        <td className="num">{g.itens.reduce((t, i) => t + Number(i.qtd), 0)}</td>
                        <td className="num">{m(subtotal)}</td>
                        <td className="num">{pctCat.toFixed(1).replace('.', ',')}%</td>
                      </tr>
                      {g.itens.map((i) => {
                        const pct = totalGeral > 0 ? (Number(i.total) / totalGeral) * 100 : 0
                        return (
                          <tr key={g.nome + '|' + i.subcategoria}>
                            <td style={{ paddingLeft: 24 }}>{i.subcategoria}</td>
                            <td className="num">{i.qtd}</td>
                            <td className="num">{m(i.total)}</td>
                            <td className="num">{pct.toFixed(1).replace('.', ',')}%</td>
                          </tr>
                        )
                      })}
                    </>
                  )
                })}
                <tr className="total">
                  <td>Total geral</td>
                  <td className="num">{linhas.reduce((t, l) => t + Number(l.qtd), 0)}</td>
                  <td className="num">{m(totalGeral)}</td>
                  <td className="num">100%</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="nota">
            Só pagamentos de contas a pagar (inclui juros e multas pagos). Não inclui funcionários
            nem adiantamentos. "Sem subcategoria" reúne contas em que ela não foi informada.
          </p>
        </>
      )}
    </>
  )
}