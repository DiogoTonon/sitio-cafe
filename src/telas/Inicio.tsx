import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StatusBadge from '../componentes/StatusBadge'
import { formatarData, formatarMoeda, hojeISO } from '../lib/formatar'

type Semana = { n: number; inicio: string; fim: string; pagar: number; receber: number }
type Painel = {
  atrasadas_qtd: number
  atrasadas_total: number
  prox7_qtd: number
  prox7_total: number
  pagar_qtd: number
  pagar_total: number
  pagar_sem_data_total: number
  receber_qtd: number
  receber_total: number
  receber7_qtd: number
  receber7_total: number
  receber_passadas_total: number
  receber_sem_data_total: number
  semanas: Semana[]
}
type Venc = {
  origem: 'conta' | 'folha' | 'temporario'
  id: string
  descricao: string
  data_vencimento: string | null
  saldo: number
  status: string
}
type Rec = {
  id: string
  descricao: string
  comprador: string | null
  data_prevista: string | null
  saldo_a_receber: number
  status: string
}

const ORIGEM = { conta: 'Conta a pagar', folha: 'Folha mensal', temporario: 'Temporário' }

const dinheiro = (v: number | string) => formatarMoeda(Number(v))
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const curta = (iso: string) => formatarData(iso).slice(0, 5)
const soma = (valores: (number | string)[]) =>
  valores.reduce<number>((t, v) => t + Math.round(Number(v) * 100), 0) / 100

function caminho(v: Venc) {
  if (v.origem === 'conta') return `/contas-pagar/${v.id}`
  if (v.origem === 'folha') return `/funcionarios/folha/${v.id}`
  return `/funcionarios/temporarios/${v.id}`
}

function somarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

function irPara(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function Tile(props: {
  cor: 'vermelho' | 'amarelo' | 'verde' | 'neutro'
  rotulo: string
  destaque: string
  detalhe?: string
  textoVer?: string
  aoVer?: () => void
}) {
  return (
    <div className={`tile ${props.cor}`}>
      <span className="tile-rotulo">{props.rotulo}</span>
      <span className="tile-numero">{props.destaque}</span>
      {props.detalhe && <span className="tile-valor">{props.detalhe}</span>}
      {props.aoVer && (
        <button className="botao-texto" type="button" onClick={props.aoVer}>
          {props.textoVer}
        </button>
      )}
    </div>
  )
}

function ListaPagar({ itens }: { itens: Venc[] }) {
  return (
    <ul className="doc-lista">
      {itens.map((v) => (
        <li className="doc-item" key={`${v.origem}-${v.id}`}>
          <div>
            <Link className="link-forte" to={caminho(v)}>
              {v.descricao}
            </Link>
            <span className="doc-meta">
              {ORIGEM[v.origem]} · vence em {formatarData(v.data_vencimento)} · falta {dinheiro(v.saldo)}
            </span>
          </div>
          <StatusBadge status={v.status} />
        </li>
      ))}
    </ul>
  )
}

export default function Inicio() {
  const [p, setP] = useState<Painel | null>(null)
  const [atrasadas, setAtrasadas] = useState<Venc[]>([])
  const [proximos, setProximos] = useState<Venc[]>([])
  const [aReceber, setAReceber] = useState<Rec[]>([])
  const [erro, setErro] = useState('')
  const [backup, setBackup] = useState<number | null | undefined>(undefined)
  useEffect(() => {
    supabase
      .from('configuracoes')
      .select('ultimo_backup')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) return
        const u = data?.ultimo_backup as string | null | undefined
        setBackup(u ? Math.floor((Date.now() - new Date(u).getTime()) / 86400000) : null)
      })
  }, [])

  const dataHoje = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  useEffect(() => {
    let cancelado = false
    async function carregar() {
      setErro('')
      const hoje = hojeISO()
      const fim7 = somarDias(hoje, 6)
      const [r, a, v, c] = await Promise.all([
        supabase.rpc('painel_inicio'),
        supabase
          .from('v_vencimentos')
          .select('*')
          .eq('status', 'Atrasada')
          .order('data_vencimento', { ascending: true })
          .limit(10),
        supabase
          .from('v_vencimentos')
          .select('*')
          .neq('status', 'Atrasada')
          .gte('data_vencimento', hoje)
          .lte('data_vencimento', fim7)
          .order('data_vencimento', { ascending: true })
          .limit(10),
        supabase
          .from('v_contas_receber')
          .select('id, descricao, comprador, data_prevista, saldo_a_receber, status')
          .in('status', ['Pendente', 'Parcialmente recebido'])
          .gt('saldo_a_receber', 0)
          .gte('data_prevista', hoje)
          .lte('data_prevista', fim7)
          .order('data_prevista', { ascending: true })
          .limit(10),
      ])
      if (cancelado) return
      if (r.error || a.error || v.error || c.error) {
        setErro('Não foi possível carregar o painel. Verifique a internet e recarregue a página.')
        return
      }
      setP(r.data as unknown as Painel)
      setAtrasadas(a.data as unknown as Venc[])
      setProximos(v.data as unknown as Venc[])
      setAReceber(c.data as unknown as Rec[])
    }
    carregar()
    return () => {
      cancelado = true
    }
  }, [])

  let hero: { nivel: string; etiqueta: string; titulo: string; texto: string; alvo?: string; botao?: string } | null =
    null
  let totPagar = 0
  let totReceber = 0
  let maximo = 1
  const fora: string[] = []

  if (p) {
    const nAtr = Number(p.atrasadas_qtd)
    const nProx = Number(p.prox7_qtd)
    if (nAtr > 0) {
      hero = {
        nivel: 'critico',
        etiqueta: 'Atenção',
        titulo: plural(nAtr, 'conta atrasada', 'contas atrasadas'),
        texto: `Somam ${dinheiro(p.atrasadas_total)} e já passaram do vencimento.`,
        alvo: 'lista-atrasadas',
        botao: 'Ver as contas atrasadas',
      }
    } else if (nProx > 0) {
      hero = {
        nivel: 'atencao',
        etiqueta: 'Fique de olho',
        titulo: `Nada atrasado, mas ${plural(nProx, 'conta vence', 'contas vencem')} nos próximos 7 dias`,
        texto: `Somam ${dinheiro(p.prox7_total)}.`,
        alvo: 'lista-proximos',
        botao: 'Ver os vencimentos',
      }
    } else {
      hero = {
        nivel: 'ok',
        etiqueta: 'Tudo em dia',
        titulo: 'Nenhuma conta atrasada nem vencendo esta semana',
        texto:
          Number(p.pagar_qtd) > 0
            ? `Há ${plural(Number(p.pagar_qtd), 'conta pendente', 'contas pendentes')}, todas com vencimento mais adiante.`
            : 'Não há contas pendentes.',
      }
    }

    totPagar = soma(p.semanas.map((s) => s.pagar))
    totReceber = soma(p.semanas.map((s) => s.receber))
    maximo = Math.max(1, ...p.semanas.flatMap((s) => [Number(s.pagar), Number(s.receber)]))

    if (Number(p.atrasadas_total) > 0) fora.push(`contas atrasadas (${dinheiro(p.atrasadas_total)})`)
    if (Number(p.pagar_sem_data_total) > 0) {
      fora.push(`pagamentos sem data de vencimento (${dinheiro(p.pagar_sem_data_total)})`)
    }
    if (Number(p.receber_passadas_total) > 0) {
      fora.push(`receitas com data prevista já passada (${dinheiro(p.receber_passadas_total)})`)
    }
    if (Number(p.receber_sem_data_total) > 0) {
      fora.push(`receitas sem data prevista (${dinheiro(p.receber_sem_data_total)})`)
    }
  }

  const pct = (v: number | string) => Math.round((Number(v) / maximo) * 100)
  const diferenca = Math.round((totReceber - totPagar) * 100) / 100

  return (
    <>
      <h1>Início</h1>
      <p className="data-hoje">{dataHoje}</p>

      <div className="atalhos">
        <Link className="botao-link" to="/contas-pagar/nova">
          + Nova despesa
        </Link>
        <Link className="botao-link" to="/contas-receber/nova">
          + Nova receita
        </Link>
        <Link className="botao-link claro" to="/contas-pagar">
          Contas a pagar
        </Link>
        <Link className="botao-link claro" to="/contas-receber">
          Contas a receber
        </Link>
        <Link className="botao-link claro" to="/relatorios">
          Relatórios anuais
        </Link>
      </div>

            {backup !== undefined && (backup === null || backup > 30) && (
        <div className="alerta-suave" role="status">
          <strong>
            {backup === null ? 'Nenhum backup foi feito ainda.' : `O último backup foi há ${backup} dias.`}
          </strong>{' '}
          <Link className="link-forte" to="/historico/exportar">
            Fazer backup agora
          </Link>
        </div>
      )}

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      {!p || !hero ? (
        !erro && <p>Carregando painel...</p>
      ) : (
        <>
          <section className={`hero ${hero.nivel}`} role="status">
            <div>
              <span className="hero-etiqueta">{hero.etiqueta}</span>
              <h2>{hero.titulo}</h2>
              <p>{hero.texto}</p>
            </div>
            {hero.alvo && (
              <button
                className="botao-pequeno"
                type="button"
                onClick={() => irPara(hero?.alvo ?? '')}
              >
                {hero.botao}
              </button>
            )}
          </section>

          <div className="tiles">
            <Tile
              cor={Number(p.atrasadas_qtd) > 0 ? 'vermelho' : 'verde'}
              rotulo="Atrasadas"
              destaque={String(p.atrasadas_qtd)}
              detalhe={dinheiro(p.atrasadas_total)}
            />
            <Tile
              cor="amarelo"
              rotulo="Vencem em 7 dias"
              destaque={String(p.prox7_qtd)}
              detalhe={dinheiro(p.prox7_total)}
            />
            <Tile
              cor="verde"
              rotulo="A receber em 7 dias"
              destaque={String(p.receber7_qtd)}
              detalhe={dinheiro(p.receber7_total)}
            />
            <Tile
              cor="neutro"
              rotulo="Total a pagar (pendentes)"
              destaque={dinheiro(p.pagar_total)}
              detalhe={plural(Number(p.pagar_qtd), 'conta', 'contas')}
            />
            <Tile
              cor="neutro"
              rotulo="Total a receber (pendentes)"
              destaque={dinheiro(p.receber_total)}
              detalhe={plural(Number(p.receber_qtd), 'receita', 'receitas')}
            />
          </div>
          <p className="nota">
            Valores em aberto são só o que falta do valor principal. Juros e multas estimados não
            entram.
          </p>

          <h2>Previsão das próximas 4 semanas</h2>
          {totPagar === 0 && totReceber === 0 ? (
            <p className="nota">
              Nada previsto para as próximas 4 semanas. Quando houver contas com vencimento ou
              receitas com data prevista nesse período, elas aparecem aqui.
            </p>
          ) : (
            <>
              <div className="cards">
                <div className="card">
                  <span className="rotulo">A pagar</span>
                  <strong>{dinheiro(totPagar)}</strong>
                </div>
                <div className="card">
                  <span className="rotulo">A receber</span>
                  <strong>{dinheiro(totReceber)}</strong>
                </div>
                <div className="card">
                  <span className="rotulo">Diferença prevista (receber − pagar)</span>
                  <strong>{dinheiro(diferenca)}</strong>
                  <span className="dica">
                    {diferenca < 0
                      ? 'Deve sair mais dinheiro do que entrar.'
                      : 'Deve entrar mais dinheiro do que sair.'}
                  </span>
                </div>
              </div>

              <div className="bloco">
                {p.semanas.map((s) => (
                  <div className="prev-semana" key={s.n}>
                    <div className="prev-titulo">
                      {s.n + 1}ª semana{' '}
                      <span className="prev-datas">
                        ({curta(s.inicio)} a {curta(s.fim)})
                      </span>
                    </div>
                    <div className="barra-linha">
                      <span className="barra-rotulo">Pagar</span>
                      <div className="barra-trilho">
                        <div className="barra pagar" style={{ width: `${pct(s.pagar)}%` }} />
                      </div>
                      <span className="barra-valor">{dinheiro(s.pagar)}</span>
                    </div>
                    <div className="barra-linha">
                      <span className="barra-rotulo">Receber</span>
                      <div className="barra-trilho">
                        <div className="barra receber" style={{ width: `${pct(s.receber)}%` }} />
                      </div>
                      <span className="barra-valor">{dinheiro(s.receber)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <p className="nota">
            Previsão feita com as datas de vencimento e de recebimento previsto que você registrou.
            {fora.length > 0 && ` Não inclui: ${fora.join('; ')}.`}
          </p>

          <h2 id="lista-atrasadas">Contas atrasadas</h2>
          {atrasadas.length === 0 ? (
            <p className="nota">Nenhuma conta atrasada.</p>
          ) : (
            <>
              <ListaPagar itens={atrasadas} />
              {Number(p.atrasadas_qtd) > atrasadas.length && (
                <p className="nota">
                  Mostrando as {atrasadas.length} mais antigas.{' '}
                  <Link className="link-forte" to="/contas-pagar?situacao=Atrasada">
                    Ver todas as contas atrasadas
                  </Link>
                </p>
              )}
            </>
          )}

          <h2 id="lista-proximos">Vencem nos próximos 7 dias</h2>
          {proximos.length === 0 ? (
            <p className="nota">Nenhum vencimento nos próximos 7 dias.</p>
          ) : (
            <ListaPagar itens={proximos} />
          )}

          <h2 id="lista-receber">A receber nos próximos 7 dias</h2>
          {aReceber.length === 0 ? (
            <p className="nota">Nenhum recebimento previsto para os próximos 7 dias.</p>
          ) : (
            <ul className="doc-lista">
              {aReceber.map((r) => (
                <li className="doc-item" key={r.id}>
                  <div>
                    <Link className="link-forte" to={`/contas-receber/${r.id}`}>
                      {r.descricao}
                    </Link>
                    <span className="doc-meta">
                      {r.comprador ? `${r.comprador} · ` : ''}previsto para {formatarData(r.data_prevista)} ·
                      falta {dinheiro(r.saldo_a_receber)}
                    </span>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  )
}