import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatarMoeda, hojeISO } from '../lib/formatar'

type Fluxo = {
  recebido_total: number
  pago_total: number
  juros_pagos: number
  multas_pagas: number
  encargos_avulsos: number
}
type Lanc = { receitas: { registradas: number }; despesas_registradas: number }
type Par = { ano: number; f: Fluxo; l: Lanc }
type Chave = 'rec' | 'des' | 'dif' | 'jm'

const MAXANOS = 6
const m = (v: number) => formatarMoeda(v)
const arred = (v: number) => Math.round(v * 100) / 100

function Var({ atual, anterior }: { atual: number; anterior: number | null }) {
  if (anterior === null) return null
  const dif = arred(atual - anterior)
  const seta = dif > 0 ? '▲' : dif < 0 ? '▼' : '='
  const sinal = dif > 0 ? '+' : dif < 0 ? '−' : ''
  let pct = '% não se aplica'
  if (anterior > 0) {
    const p = (dif / anterior) * 100
    pct = `${p > 0 ? '+' : ''}${p.toFixed(1).replace('.', ',')}%`
  }
  return (
    <span className="var-linha">
      {seta} {sinal}
      {m(Math.abs(dif))} ({pct})
    </span>
  )
}

export default function Comparacao() {
  const anoAtual = Number(hojeISO().slice(0, 4))
  const anos = Array.from({ length: 8 }, (_, i) => anoAtual + 1 - i)

  const [sel, setSel] = useState<number[]>([anoAtual - 1, anoAtual])
  const [modo, setModo] = useState<'fluxo' | 'lancamentos'>('fluxo')
  const [pares, setPares] = useState<Par[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const chave = [...sel].sort((a, b) => a - b).join(',')

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      const lista = chave ? chave.split(',').map(Number) : []
      if (lista.length < 2) {
        setPares([])
        return
      }
      setCarregando(true)
      setErro('')
      try {
        const res = await Promise.all(
          lista.map(async (ano) => {
            const [f, l] = await Promise.all([
              supabase.rpc('relatorio_fluxo', { p_ano: ano }),
              supabase.rpc('relatorio_lancamentos', { p_ano: ano }),
            ])
            if (f.error || l.error) throw new Error('falha')
            return { ano, f: f.data as unknown as Fluxo, l: l.data as unknown as Lanc }
          }),
        )
        if (!cancelado) setPares(res)
      } catch {
        if (!cancelado) {
          setErro('Não foi possível carregar a comparação. Verifique a internet e tente de novo.')
          setPares([])
        }
      }
      if (!cancelado) setCarregando(false)
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [chave])

  function alternar(a: number) {
    setAviso('')
    if (sel.includes(a)) setSel(sel.filter((x) => x !== a))
    else if (sel.length >= MAXANOS) setAviso(`Escolha no máximo ${MAXANOS} anos de cada vez.`)
    else setSel([...sel, a])
  }

  const cols = pares.map((p) => {
    const rec = Number(modo === 'fluxo' ? p.f.recebido_total : p.l.receitas.registradas)
    const des = Number(modo === 'fluxo' ? p.f.pago_total : p.l.despesas_registradas)
    return {
      ano: p.ano,
      rec,
      des,
      dif: arred(rec - des),
      jm: arred(Number(p.f.juros_pagos) + Number(p.f.multas_pagas) + Number(p.f.encargos_avulsos)),
      dados: rec !== 0 || des !== 0,
    }
  })

  const linhas: { nome: string; chave: Chave }[] = [
    { nome: modo === 'fluxo' ? 'Total recebido' : 'Receitas registradas', chave: 'rec' },
    { nome: modo === 'fluxo' ? 'Total pago' : 'Despesas registradas', chave: 'des' },
    {
      nome: modo === 'fluxo' ? 'Diferença (recebido − pago)' : 'Resultado dos lançamentos',
      chave: 'dif',
    },
    { nome: 'Juros e multas pagos', chave: 'jm' },
  ]

  const maximo = Math.max(1, ...cols.flatMap((c) => [c.rec, c.des]))

  return (
    <>
      <h2>Comparação entre anos</h2>
      <p>
        Escolha de 2 a {MAXANOS} anos. A variação de cada ano é calculada em relação ao ano anterior
        da lista.
      </p>

      <section className="bloco">
        <div className="campo">
          <label htmlFor="cp-modo">O que comparar</label>
          <select
            id="cp-modo"
            value={modo}
            onChange={(e) => setModo(e.target.value as 'fluxo' | 'lancamentos')}
          >
            <option value="fluxo">Fluxo de caixa (dinheiro que entrou e saiu)</option>
            <option value="lancamentos">Receitas e despesas lançadas (inclui pendentes)</option>
          </select>
        </div>
        <fieldset className="sem-borda">
          <legend>Anos</legend>
          <div className="checks">
            {anos.map((a) => (
              <label key={a}>
                <input type="checkbox" checked={sel.includes(a)} onChange={() => alternar(a)} />
                {a}
              </label>
            ))}
          </div>
        </fieldset>
        {aviso && (
          <p className="erro" role="alert">
            {aviso}
          </p>
        )}
      </section>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {sel.length < 2 ? (
        <p className="bloco">Escolha pelo menos dois anos para comparar.</p>
      ) : carregando && cols.length === 0 ? (
        <p>Carregando comparação...</p>
      ) : cols.length > 0 ? (
        <>
          {cols.every((c) => !c.dados) && (
            <p className="bloco">
              Não há movimentações nos anos escolhidos. Nenhum valor é estimado.
            </p>
          )}

          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Indicador</th>
                  {cols.map((c) => (
                    <th className="num" key={c.ano}>
                      {c.ano}
                      {!c.dados && <span className="sub-nota">sem dados</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.chave}>
                    <td>{l.nome}</td>
                    {cols.map((c, i) => (
                      <td className="num" key={c.ano}>
                        {m(c[l.chave])}
                        <Var atual={c[l.chave]} anterior={i > 0 ? cols[i - 1][l.chave] : null} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="nota">
            {modo === 'fluxo'
              ? 'Fluxo de caixa: só o que foi de fato recebido e pago em cada ano.'
              : 'Lançamentos: tudo o que foi registrado no ano, inclusive o que ainda está pendente.'}{' '}
            A variação em % não se aplica quando o valor do ano anterior é zero ou negativo. Juros e
            multas pagos são sempre os efetivamente pagos no ano.
          </p>

          <h3>Receitas e despesas por ano</h3>
          <div className="bloco">
            {cols.map((c) => (
              <div className="prev-semana" key={c.ano}>
                <div className="prev-titulo">{c.ano}</div>
                <div className="barra-linha">
                  <span className="barra-rotulo">Receitas</span>
                  <div className="barra-trilho">
                    <div className="barra receber" style={{ width: `${Math.round((c.rec / maximo) * 100)}%` }} />
                  </div>
                  <span className="barra-valor">{m(c.rec)}</span>
                </div>
                <div className="barra-linha">
                  <span className="barra-rotulo">Despesas</span>
                  <div className="barra-trilho">
                    <div className="barra pagar" style={{ width: `${Math.round((c.des / maximo) * 100)}%` }} />
                  </div>
                  <span className="barra-valor">{m(c.des)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}