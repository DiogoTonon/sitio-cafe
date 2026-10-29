import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatarData, formatarMoeda, hojeISO, lerValor, numeroBR } from '../lib/formatar'

type Item = {
  id: string
  tipo: 'hora_extra' | 'desconto' | 'adiantamento'
  data: string
  descricao: string | null
  horas: number | null
  valor_hora: number | null
  valor: number
}

const NOMES = { hora_extra: 'Hora extra', desconto: 'Desconto', adiantamento: 'Adiantamento' }

function mensagemDeErro(e: { code?: string; message: string }) {
  if (e.code === 'P0001') return e.message
  if (e.code === '23514') return 'Algum campo está com valor inválido. Confira os valores e a descrição.'
  return 'Não foi possível salvar. Verifique a internet e tente de novo.'
}

export default function FolhaItens(props: {
  folhaId: string
  cancelada: boolean
  aoMudar: () => void
}) {
  const topoRef = useRef<HTMLElement>(null)
  const [lista, setLista] = useState<Item[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [abertos, setAbertos] = useState<Record<string, boolean>>({})
  const [formAberto, setFormAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [tipo, setTipo] = useState<Item['tipo']>('hora_extra')
  const [data, setData] = useState(hojeISO())
  const [descricao, setDescricao] = useState('')
  const [horasTxt, setHorasTxt] = useState('')
  const [valorHoraTxt, setValorHoraTxt] = useState('')
  const [valorTxt, setValorTxt] = useState('')

  const carregar = useCallback(async () => {
    const { data: linhas, error } = await supabase
      .from('folha_itens')
      .select('id, tipo, data, descricao, horas, valor_hora, valor')
      .eq('folha_id', props.folhaId)
      .order('data', { ascending: false })
      .order('criado_em', { ascending: false })
    if (error) setErro('Não foi possível carregar os lançamentos. Recarregue a página.')
    else setLista(linhas)
    setCarregando(false)
  }, [props.folhaId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const horas = lerValor(horasTxt)
  const valorHora = lerValor(valorHoraTxt)
  const totalHE =
    horas && valorHora ? Math.round(horas * valorHora * 100) / 100 : null

  function falha(texto: string) {
    setErro(texto)
    topoRef.current?.scrollIntoView({ block: 'start' })
  }

  function limparCampos() {
    setTipo('hora_extra')
    setData(hojeISO())
    setDescricao('')
    setHorasTxt('')
    setValorHoraTxt('')
    setValorTxt('')
  }

  function abrirNovo() {
    setErro('')
    setAviso('')
    setEditandoId(null)
    limparCampos()
    setFormAberto(true)
  }

  function abrirEdicao(i: Item) {
    setErro('')
    setAviso('')
    setEditandoId(i.id)
    setTipo(i.tipo)
    setData(i.data)
    setDescricao(i.descricao ?? '')
    setHorasTxt(i.horas !== null ? numeroBR(i.horas) : '')
    setValorHoraTxt(i.valor_hora !== null ? numeroBR(i.valor_hora) : '')
    setValorTxt(numeroBR(i.valor))
    setFormAberto(true)
    topoRef.current?.scrollIntoView({ block: 'start' })
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')

    let dados: Record<string, unknown>
    if (tipo === 'hora_extra') {
      if (horas === null || horas <= 0) return falha('Digite a quantidade de horas, maior que zero (ex.: 10 ou 10,5).')
      if (valorHora === null || valorHora <= 0) return falha('Digite o valor da hora, maior que zero (ex.: 15,50).')
      dados = {
        tipo,
        data,
        descricao: descricao.trim() || null,
        horas,
        valor_hora: valorHora,
        valor: Math.round(horas * valorHora * 100) / 100,
      }
    } else {
      const valor = lerValor(valorTxt)
      if (valor === null || valor <= 0) return falha('Digite o valor, maior que zero. Use vírgula para os centavos.')
      if (!descricao.trim()) return falha('Explique o motivo na descrição. Ela é obrigatória para descontos e adiantamentos.')
      if (tipo === 'adiantamento' && data > hojeISO()) {
        return falha('A data do adiantamento não pode ser no futuro. Use o dia em que o dinheiro foi entregue.')
      }
      dados = { tipo, data, descricao: descricao.trim(), horas: null, valor_hora: null, valor }
    }

    setSalvando(true)
    const r = editandoId
      ? await supabase.from('folha_itens').update(dados).eq('id', editandoId).select('id')
      : await supabase.from('folha_itens').insert({ ...dados, folha_id: props.folhaId }).select('id')
    setSalvando(false)

    if (r.error) return falha(mensagemDeErro(r.error))
    if (!r.data || r.data.length === 0) return falha('Não foi possível salvar o lançamento.')

    setFormAberto(false)
    setEditandoId(null)
    setAviso(editandoId ? 'Lançamento corrigido.' : 'Lançamento registrado.')
    await carregar()
    props.aoMudar()
  }

  async function excluir(i: Item) {
    setErro('')
    setAviso('')
    const ok = window.confirm(
      `Excluir ${NOMES[i.tipo].toLowerCase()} de ${formatarMoeda(i.valor)} (${formatarData(i.data)})?\n\nA exclusão fica registrada no histórico.`,
    )
    if (!ok) return
    const { data: apagados, error } = await supabase
      .from('folha_itens')
      .delete()
      .eq('id', i.id)
      .select('id')
    if (error) return falha(mensagemDeErro(error))
    if (!apagados || apagados.length === 0) return falha('Não foi possível excluir o lançamento.')
    setAviso('Lançamento excluído.')
    await carregar()
    props.aoMudar()
  }

  if (carregando) {
    return (
      <section className="bloco">
        <p>Carregando lançamentos...</p>
      </section>
    )
  }

  return (
    <section className="bloco" ref={topoRef}>
      <h3>Horas extras, descontos e adiantamentos</h3>

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
        <p className="nota">Nenhum lançamento neste mês.</p>
      ) : (
        <ul className="doc-lista">
          {lista.map((i) => (
            <li className="doc-item" key={i.id}>
              <div>
                <span className="doc-nome">
                  {NOMES[i.tipo]} · {i.tipo === 'hora_extra' ? '+' : '−'} {formatarMoeda(i.valor)}
                </span>
                <span className="doc-meta">
                  {formatarData(i.data)}
                  {i.tipo === 'hora_extra' &&
                    ` · ${numeroBR(i.horas ?? 0)} h × ${formatarMoeda(i.valor_hora)}`}
                </span>
                {i.descricao && (
                  <>
                    <button
                      className="botao-texto"
                      type="button"
                      aria-expanded={abertos[i.id] === true}
                      onClick={() => setAbertos({ ...abertos, [i.id]: !abertos[i.id] })}
                    >
                      {abertos[i.id] ? 'Esconder descrição' : 'Ver descrição'}
                    </button>
                    {abertos[i.id] && <div className="balao">{i.descricao}</div>}
                  </>
                )}
              </div>
              {!props.cancelada && (
                <div className="item-acoes">
                  <button className="botao-texto" type="button" onClick={() => abrirEdicao(i)}>
                    Corrigir
                  </button>
                  <button className="botao-texto perigo" type="button" onClick={() => excluir(i)}>
                    Excluir
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {!props.cancelada && !formAberto && (
        <div className="linha">
          <button className="botao-pequeno" type="button" onClick={abrirNovo}>
            + Novo lançamento
          </button>
        </div>
      )}

      {formAberto && (
        <form onSubmit={salvar}>
          <fieldset className="sem-borda" disabled={salvando}>
            <h3>{editandoId ? 'Corrigir lançamento' : 'Novo lançamento'}</h3>
            <div className="grade">
              <div className="campo">
                <label htmlFor="fi-tipo">
                  O que é? <span className="obrig">(obrigatório)</span>
                </label>
                <select
                  id="fi-tipo"
                  value={tipo}
                  disabled={editandoId !== null}
                  onChange={(e) => setTipo(e.target.value as Item['tipo'])}
                >
                  <option value="hora_extra">Hora extra (soma no pagamento)</option>
                  <option value="desconto">Desconto (tira do pagamento)</option>
                  <option value="adiantamento">Adiantamento já entregue (tira do pagamento)</option>
                </select>
              </div>

              <div className="campo">
                <label htmlFor="fi-data">
                  Data <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="fi-data"
                  type="date"
                  required
                  max={tipo === 'adiantamento' ? hojeISO() : undefined}
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>

              {tipo === 'hora_extra' ? (
                <>
                  <div className="campo">
                    <label htmlFor="fi-horas">
                      Quantidade de horas <span className="obrig">(obrigatório)</span>
                    </label>
                    <input
                      id="fi-horas"
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex.: 10 ou 10,5"
                      value={horasTxt}
                      onChange={(e) => setHorasTxt(e.target.value)}
                    />
                  </div>
                  <div className="campo">
                    <label htmlFor="fi-vh">
                      Valor da hora (R$) <span className="obrig">(obrigatório)</span>
                    </label>
                    <input
                      id="fi-vh"
                      type="text"
                      inputMode="decimal"
                      placeholder="Ex.: 15,50"
                      value={valorHoraTxt}
                      onChange={(e) => setValorHoraTxt(e.target.value)}
                    />
                  </div>
                  <div className="campo largo">
                    <div className="resumo-calculo">
                      Total da hora extra: {totalHE !== null ? formatarMoeda(totalHE) : '—'}
                    </div>
                  </div>
                </>
              ) : (
                <div className="campo largo">
                  <label htmlFor="fi-valor">
                    Valor (R$) <span className="obrig">(obrigatório)</span>
                  </label>
                  <input
                    id="fi-valor"
                    type="text"
                    inputMode="decimal"
                    value={valorTxt}
                    onChange={(e) => setValorTxt(e.target.value)}
                  />
                </div>
              )}

              <div className="campo largo">
                <label htmlFor="fi-desc">
                  Descrição{' '}
                  <span className="obrig">
                    {tipo === 'hora_extra' ? '(opcional)' : '(obrigatório: explique o motivo)'}
                  </span>
                </label>
                <textarea
                  id="fi-desc"
                  rows={2}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                />
              </div>
            </div>

            <div className="linha">
              <button className="botao-pequeno" type="submit">
                {salvando ? 'Salvando...' : editandoId ? 'Salvar correção' : 'Registrar lançamento'}
              </button>
              <button
                className="botao-pequeno secundario"
                type="button"
                onClick={() => {
                  setFormAberto(false)
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