import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatarMoeda, lerValor, numeroBR } from '../lib/formatar'

type Pessoa = {
  id: string
  nome: string
  funcao: string | null
  tipo: 'fixo' | 'temporario'
  salario_base: number | null
  dia_pagamento: number | null
  pagamento_mes_seguinte: boolean | null
  telefone: string | null
  observacoes: string | null
  ativo: boolean
}

type Dados = {
  nome: string
  funcao: string
  tipo: 'fixo' | 'temporario'
  salario: string
  dia: string
  mesSeguinte: 'sim' | 'nao'
  telefone: string
  observacoes: string
}

const VAZIO: Dados = {
  nome: '',
  funcao: '',
  tipo: 'fixo',
  salario: '',
  dia: '',
  mesSeguinte: 'sim',
  telefone: '',
  observacoes: '',
}

function mensagemDeErro(e: { code?: string; message: string }) {
  if (e.code === 'P0001') return e.message
  if (e.code === '23514') return 'Algum campo está com valor inválido. Confira os dados.'
  return 'Não foi possível salvar. Verifique a internet e tente de novo.'
}

function Formulario(props: {
  titulo: string
  inicial: Dados
  tipoTravado: boolean
  aoSalvar: (dados: Record<string, unknown>) => Promise<string | null>
  aoCancelar: () => void
}) {
  const [d, setD] = useState<Dados>(props.inicial)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')

    let salario: number | null = null
    let dia: number | null = null
    if (d.tipo === 'fixo') {
      salario = lerValor(d.salario)
      if (salario === null || salario <= 0) {
        setErro('Digite o salário base, maior que zero. Use vírgula para os centavos.')
        return
      }
      dia = Number(d.dia)
      if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
        setErro('O dia do pagamento deve ser um número de 1 a 31.')
        return
      }
    }

    const dados = {
      nome: d.nome.trim(),
      funcao: d.funcao.trim() || null,
      tipo: d.tipo,
      salario_base: salario,
      dia_pagamento: dia,
      pagamento_mes_seguinte: d.tipo === 'fixo' ? d.mesSeguinte === 'sim' : null,
      telefone: d.telefone.trim() || null,
      observacoes: d.observacoes.trim() || null,
    }

    setSalvando(true)
    const mensagem = await props.aoSalvar(dados)
    setSalvando(false)
    if (mensagem) setErro(mensagem)
  }

  return (
    <form className="bloco" onSubmit={enviar}>
      <fieldset className="sem-borda" disabled={salvando}>
        <h3>{props.titulo}</h3>

        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}

        <div className="grade">
          <div className="campo largo">
            <label htmlFor="p-nome">
              Nome <span className="obrig">(obrigatório)</span>
            </label>
            <input
              id="p-nome"
              type="text"
              required
              maxLength={150}
              value={d.nome}
              onChange={(e) => setD({ ...d, nome: e.target.value })}
            />
          </div>

          <div className="campo">
            <label htmlFor="p-funcao">Função</label>
            <input
              id="p-funcao"
              type="text"
              maxLength={100}
              placeholder="Ex.: Tratorista"
              value={d.funcao}
              onChange={(e) => setD({ ...d, funcao: e.target.value })}
            />
          </div>

          <div className="campo">
            <label htmlFor="p-tipo">
              Tipo <span className="obrig">(obrigatório)</span>
            </label>
            <select
              id="p-tipo"
              value={d.tipo}
              disabled={props.tipoTravado}
              onChange={(e) => setD({ ...d, tipo: e.target.value as 'fixo' | 'temporario' })}
            >
              <option value="fixo">Fixo (recebe salário todo mês)</option>
              <option value="temporario">Temporário (por diária ou empreita)</option>
            </select>
            {props.tipoTravado && (
              <span className="dica">O tipo não pode ser mudado. Para trocar, cadastre uma nova pessoa.</span>
            )}
          </div>

          {d.tipo === 'fixo' && (
            <>
              <div className="campo">
                <label htmlFor="p-salario">
                  Salário base (R$) <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="p-salario"
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex.: 2.000,00"
                  value={d.salario}
                  onChange={(e) => setD({ ...d, salario: e.target.value })}
                />
                <span className="dica">Mudar o salário vale só para as próximas folhas.</span>
              </div>

              <div className="campo">
                <label htmlFor="p-dia">
                  Dia do pagamento <span className="obrig">(obrigatório)</span>
                </label>
                <input
                  id="p-dia"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={31}
                  value={d.dia}
                  onChange={(e) => setD({ ...d, dia: e.target.value })}
                />
              </div>

              <div className="campo largo">
                <label htmlFor="p-mes">
                  O pagamento é feito <span className="obrig">(obrigatório)</span>
                </label>
                <select
                  id="p-mes"
                  value={d.mesSeguinte}
                  onChange={(e) => setD({ ...d, mesSeguinte: e.target.value as 'sim' | 'nao' })}
                >
                  <option value="sim">No mês seguinte ao trabalhado</option>
                  <option value="nao">No mesmo mês trabalhado</option>
                </select>
              </div>
            </>
          )}

          <div className="campo">
            <label htmlFor="p-tel">Telefone</label>
            <input
              id="p-tel"
              type="text"
              inputMode="tel"
              maxLength={30}
              value={d.telefone}
              onChange={(e) => setD({ ...d, telefone: e.target.value })}
            />
          </div>

          <div className="campo largo">
            <label htmlFor="p-obs">Observações</label>
            <textarea
              id="p-obs"
              rows={2}
              value={d.observacoes}
              onChange={(e) => setD({ ...d, observacoes: e.target.value })}
            />
          </div>
        </div>

        <div className="linha">
          <button className="botao-pequeno" type="submit">
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
          <button className="botao-pequeno secundario" type="button" onClick={props.aoCancelar}>
            Cancelar
          </button>
        </div>
      </fieldset>
    </form>
  )
}

export default function Pessoas() {
  const [lista, setLista] = useState<Pessoa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('funcionarios').select('*').order('nome')
    if (error) setErro('Não foi possível carregar as pessoas. Recarregue a página.')
    else setLista(data)
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  function limparMensagens() {
    setErro('')
    setAviso('')
  }

  async function criar(dados: Record<string, unknown>) {
    limparMensagens()
    const { error } = await supabase.from('funcionarios').insert(dados)
    if (error) return mensagemDeErro(error)
    setCriando(false)
    setAviso('Pessoa cadastrada.')
    carregar()
    return null
  }

  async function salvarEdicao(id: string, dados: Record<string, unknown>) {
    limparMensagens()
    const { data, error } = await supabase.from('funcionarios').update(dados).eq('id', id).select('id')
    if (error) return mensagemDeErro(error)
    if (!data || data.length === 0) return 'Não foi possível salvar as alterações.'
    setEditandoId(null)
    setAviso('Alterações salvas.')
    carregar()
    return null
  }

  async function alternar(p: Pessoa) {
    limparMensagens()
    if (p.ativo) {
      const confirmou = window.confirm(
        `Desativar "${p.nome}"?\n\nO histórico de pagamentos continua guardado. A pessoa só deixa de aparecer para novos lançamentos. Você pode reativar quando quiser.`,
      )
      if (!confirmou) return
    }
    const { error } = await supabase.from('funcionarios').update({ ativo: !p.ativo }).eq('id', p.id)
    if (error) {
      setErro(mensagemDeErro(error))
      return
    }
    setAviso(p.ativo ? `"${p.nome}" foi desativado(a).` : `"${p.nome}" foi reativado(a).`)
    carregar()
  }

  async function excluir(p: Pessoa) {
    limparMensagens()
    const confirmou = window.confirm(
      `Excluir "${p.nome}" de vez?\n\nIsso só é possível se a pessoa nunca teve folha ou serviço lançado. Esta ação não pode ser desfeita.`,
    )
    if (!confirmou) return

    const { data, error } = await supabase.from('funcionarios').delete().eq('id', p.id).select('id')
    if (error) {
      setErro(
        error.code === '23503'
          ? `Não é possível excluir "${p.nome}" porque já existem lançamentos dessa pessoa. Use "Desativar" no lugar.`
          : mensagemDeErro(error),
      )
      return
    }
    if (!data || data.length === 0) {
      setErro(`Não foi possível excluir "${p.nome}".`)
      return
    }
    setAviso(`"${p.nome}" foi excluído(a).`)
    carregar()
  }

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return lista.filter(
      (p) =>
        (!filtroTipo || p.tipo === filtroTipo) &&
        (!t || p.nome.toLowerCase().includes(t) || (p.funcao ?? '').toLowerCase().includes(t)),
    )
  }, [lista, filtroTipo, busca])

  function dadosIniciais(p: Pessoa): Dados {
    return {
      nome: p.nome,
      funcao: p.funcao ?? '',
      tipo: p.tipo,
      salario: p.salario_base !== null ? numeroBR(p.salario_base) : '',
      dia: p.dia_pagamento !== null ? String(p.dia_pagamento) : '',
      mesSeguinte: p.pagamento_mes_seguinte === false ? 'nao' : 'sim',
      telefone: p.telefone ?? '',
      observacoes: p.observacoes ?? '',
    }
  }

  if (carregando) return <p>Carregando pessoas...</p>

  return (
    <>
      <h2>Pessoas</h2>
      <p>
        Funcionários fixos recebem salário todo mês. Temporários recebem por diária ou empreita, e
        o valor é informado em cada lançamento. Nada em uso é apagado: quando alguém sair,
        desative o cadastro.
      </p>

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

      {criando ? (
        <Formulario
          titulo="Nova pessoa"
          inicial={VAZIO}
          tipoTravado={false}
          aoSalvar={criar}
          aoCancelar={() => setCriando(false)}
        />
      ) : (
        <div className="linha">
          <button
            className="botao-pequeno"
            type="button"
            onClick={() => {
              limparMensagens()
              setEditandoId(null)
              setCriando(true)
            }}
          >
            + Nova pessoa
          </button>
        </div>
      )}

      {lista.length > 0 && (
        <div className="bloco filtros">
          <div className="campo">
            <label htmlFor="pf-tipo">Mostrar</label>
            <select id="pf-tipo" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              <option value="fixo">Só fixos</option>
              <option value="temporario">Só temporários</option>
            </select>
          </div>
          <div className="campo">
            <label htmlFor="pf-busca">Procurar por nome ou função</label>
            <input
              id="pf-busca"
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </div>
      )}

      {lista.length === 0 && <p className="bloco">Nenhuma pessoa cadastrada ainda.</p>}
      {lista.length > 0 && visiveis.length === 0 && (
        <p className="bloco">Ninguém encontrado com esses filtros.</p>
      )}

      {visiveis.map((p) =>
        editandoId === p.id ? (
          <Formulario
            key={p.id}
            titulo="Editar pessoa"
            inicial={dadosIniciais(p)}
            tipoTravado={true}
            aoSalvar={(dados) => salvarEdicao(p.id, dados)}
            aoCancelar={() => setEditandoId(null)}
          />
        ) : (
          <section className="forn-card" key={p.id}>
            <div className="item-linha">
              <div className="item-info">
                <span className={p.ativo ? 'forn-nome' : 'forn-nome desativado'}>{p.nome}</span>
                <span className="selo unidade">{p.tipo === 'fixo' ? 'Fixo' : 'Temporário'}</span>
                {!p.ativo && <span className="selo inativa">Desativado</span>}
              </div>
              <div className="item-acoes">
                <button
                  className="botao-texto"
                  type="button"
                  onClick={() => {
                    limparMensagens()
                    setCriando(false)
                    setEditandoId(p.id)
                  }}
                >
                  Editar
                </button>
                <button className="botao-texto" type="button" onClick={() => alternar(p)}>
                  {p.ativo ? 'Desativar' : 'Reativar'}
                </button>
                <button className="botao-texto perigo" type="button" onClick={() => excluir(p)}>
                  Excluir
                </button>
              </div>
            </div>
            <p className="forn-dados">
              {p.funcao && <span>Função: {p.funcao}</span>}
              {p.tipo === 'fixo' && p.salario_base !== null && (
                <span>
                  Salário base: {formatarMoeda(p.salario_base)} · paga dia {p.dia_pagamento}{' '}
                  {p.pagamento_mes_seguinte ? 'do mês seguinte' : 'do mesmo mês'}
                </span>
              )}
              {p.telefone && <span>Telefone: {p.telefone}</span>}
            </p>
            {p.observacoes && <p className="nota">{p.observacoes}</p>}
          </section>
        ),
      )}
    </>
  )
}