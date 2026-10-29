import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatarData, formatarQuantidade, hojeISO, lerQuantidade } from '../lib/formatar'

type Dia = { id: string; data: string; quantidade: number }
type Props = {
  servicoId: string
  modalidade: 'diaria' | 'empreita'
  cancelada: boolean
  aoMudar: () => void
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export default function ServicoDias({ servicoId, modalidade, cancelada, aoMudar }: Props) {
  const [dias, setDias] = useState<Dia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [mes, setMes] = useState(hojeISO().slice(0, 7))
  const [selData, setSelData] = useState<string | null>(null)
  const [qtdTxt, setQtdTxt] = useState('')
  const [salvando, setSalvando] = useState(false)
  const primeira = useRef(true)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('servico_dias')
      .select('id, data, quantidade')
      .eq('servico_id', servicoId)
      .order('data')
    if (error) {
      setErro('Não foi possível carregar os dias. Recarregue a página.')
    } else {
      setDias(data)
      if (primeira.current && data.length > 0) setMes(data[data.length - 1].data.slice(0, 7))
    }
    primeira.current = false
    setCarregando(false)
  }, [servicoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const mapa: Record<string, Dia> = {}
  dias.forEach((d) => (mapa[d.data] = d))

  const [ano, mm] = mes.split('-').map(Number)
  const primeiroDia = new Date(Date.UTC(ano, mm - 1, 1)).getUTCDay()
  const totalDias = new Date(Date.UTC(ano, mm, 0)).getUTCDate()
  const celulas: (number | null)[] = [
    ...Array<null>(primeiroDia).fill(null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ]
  const dataDe = (dia: number) => `${mes}-${String(dia).padStart(2, '0')}`

  function mudarMes(delta: number) {
    const d = new Date(Date.UTC(ano, mm - 1 + delta, 1))
    setMes(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
    setSelData(null)
  }

  async function depoisDeSalvar(error: { code?: string; message: string } | null) {
    setSalvando(false)
    if (error) {
      setErro(
        error.code === 'P0001'
          ? error.message
          : error.code === '23505'
            ? 'Este dia já está marcado.'
            : 'Não foi possível salvar. Verifique a internet e tente de novo.',
      )
      return
    }
    setSelData(null)
    await carregar()
    aoMudar()
  }

  async function clicarDia(data: string) {
    if (cancelada || salvando) return
    setErro('')
    const existente = mapa[data]
    if (modalidade === 'diaria') {
      setSalvando(true)
      const r = existente
        ? await supabase.from('servico_dias').delete().eq('id', existente.id)
        : await supabase.from('servico_dias').insert({ servico_id: servicoId, data, quantidade: 1 })
      await depoisDeSalvar(r.error)
      return
    }
    setSelData(data)
    setQtdTxt(existente ? formatarQuantidade(existente.quantidade) : '')
  }

  async function salvarQuantidade(evento: FormEvent) {
    evento.preventDefault()
    if (!selData) return
    setErro('')
    const q = lerQuantidade(qtdTxt)
    if (q === null || q <= 0) {
      setErro('Digite a quantidade de sacos, maior que zero (ex.: 12 ou 12,5).')
      return
    }
    setSalvando(true)
    const existente = mapa[selData]
    const r = existente
      ? await supabase.from('servico_dias').update({ quantidade: q }).eq('id', existente.id)
      : await supabase.from('servico_dias').insert({ servico_id: servicoId, data: selData, quantidade: q })
    await depoisDeSalvar(r.error)
  }

  async function removerSelecionado() {
    if (!selData || !mapa[selData]) return
    setErro('')
    setSalvando(true)
    const r = await supabase.from('servico_dias').delete().eq('id', mapa[selData].id)
    await depoisDeSalvar(r.error)
  }

  if (carregando) {
    return (
      <section className="bloco">
        <p>Carregando dias...</p>
      </section>
    )
  }

  const empreita = modalidade === 'empreita'

  return (
    <section className="bloco">
      <h3>Dias trabalhados</h3>
      <p className="nota">
        {cancelada
          ? 'Este lançamento está cancelado e não aceita alterações nos dias.'
          : empreita
            ? 'Toque no dia para informar quantos sacos foram colhidos.'
            : 'Toque nos dias trabalhados para marcar. Toque de novo para desmarcar.'}
      </p>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}

      <div className="cal-topo">
        <button className="botao-pequeno secundario" type="button" onClick={() => mudarMes(-1)}>
          ← Mês anterior
        </button>
        <strong>
          {MESES[mm - 1]} de {ano}
        </strong>
        <button className="botao-pequeno secundario" type="button" onClick={() => mudarMes(1)}>
          Próximo mês →
        </button>
      </div>

      <div className="cal-grade" role="group" aria-label={`Calendário de ${MESES[mm - 1]} de ${ano}`}>
        {SEMANA.map((s) => (
          <span className="cal-semana" key={s}>
            {s}
          </span>
        ))}
        {celulas.map((dia, i) => {
          if (dia === null) return <span key={`v${i}`} />
          const data = dataDe(dia)
          const marcado = mapa[data]
          const classe = `cal-dia${marcado ? ' marcado' : ''}${selData === data ? ' selecionado' : ''}`
          return (
            <button
              key={data}
              type="button"
              className={classe}
              disabled={cancelada || salvando}
              aria-pressed={!!marcado}
              aria-label={`${formatarData(data)}${marcado ? ', marcado' : ''}`}
              onClick={() => clicarDia(data)}
            >
              <span>{dia}</span>
              {marcado && (
                <small>{empreita ? formatarQuantidade(marcado.quantidade) : '✓'}</small>
              )}
            </button>
          )
        })}
      </div>

      {empreita && selData && (
        <form className="novo-forn" onSubmit={salvarQuantidade}>
          <label htmlFor="sd-qtd">Sacos colhidos em {formatarData(selData)}</label>
          <input
            id="sd-qtd"
            type="text"
            inputMode="decimal"
            placeholder="Ex.: 12 ou 12,5"
            value={qtdTxt}
            onChange={(e) => setQtdTxt(e.target.value)}
          />
          <div className="linha">
            <button className="botao-pequeno" type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar quantidade'}
            </button>
            {mapa[selData] && (
              <button
                className="botao-pequeno secundario"
                type="button"
                disabled={salvando}
                onClick={removerSelecionado}
              >
                Remover este dia
              </button>
            )}
            <button className="botao-pequeno secundario" type="button" onClick={() => setSelData(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <h3>Dias marcados ({dias.length})</h3>
      {dias.length === 0 ? (
        <p className="nota">Nenhum dia marcado ainda.</p>
      ) : (
        <p className="chips">
          {dias.map((d) => (
            <span className="chip" key={d.id}>
              {formatarData(d.data)}
              {empreita ? ` · ${formatarQuantidade(d.quantidade)} sacos` : ''}
            </span>
          ))}
        </p>
      )}
    </section>
  )
}