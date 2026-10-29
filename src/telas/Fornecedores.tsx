import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Fornecedor = {
  id: string
  nome: string
  documento: string | null
  telefone: string | null
  observacoes: string | null
  ativo: boolean
}

type Dados = { nome: string; documento: string; telefone: string; observacoes: string }

const VAZIO: Dados = { nome: '', documento: '', telefone: '', observacoes: '' }

function mensagemDeErro(codigo?: string) {
  if (codigo === '23505') return 'Já existe um fornecedor com esse nome. Escolha outro nome.'
  return 'Não foi possível salvar. Verifique a internet e tente de novo.'
}

function paraBanco(d: Dados) {
  return {
    nome: d.nome.trim(),
    documento: d.documento.trim() || null,
    telefone: d.telefone.trim() || null,
    observacoes: d.observacoes.trim() || null,
  }
}

function Formulario(props: {
  titulo: string
  inicial: Dados
  aoSalvar: (dados: Dados) => Promise<boolean>
  aoCancelar: () => void
}) {
  const [d, setD] = useState<Dados>(props.inicial)
  const [salvando, setSalvando] = useState(false)

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setSalvando(true)
    await props.aoSalvar(d)
    setSalvando(false)
  }

  return (
    <form className="bloco" onSubmit={enviar}>
      <fieldset className="sem-borda" disabled={salvando}>
        <h3>{props.titulo}</h3>
        <div className="grade">
          <div className="campo largo">
            <label htmlFor="forn-nome">
              Nome do fornecedor <span className="obrig">(obrigatório)</span>
            </label>
            <input
              id="forn-nome"
              type="text"
              required
              maxLength={150}
              placeholder="Ex.: Posto Boa Viagem"
              value={d.nome}
              onChange={(e) => setD({ ...d, nome: e.target.value })}
            />
          </div>

          <div className="campo">
            <label htmlFor="forn-doc">CPF ou CNPJ</label>
            <input
              id="forn-doc"
              type="text"
              maxLength={30}
              value={d.documento}
              onChange={(e) => setD({ ...d, documento: e.target.value })}
            />
          </div>

          <div className="campo">
            <label htmlFor="forn-tel">Telefone</label>
            <input
              id="forn-tel"
              type="text"
              inputMode="tel"
              maxLength={30}
              value={d.telefone}
              onChange={(e) => setD({ ...d, telefone: e.target.value })}
            />
          </div>

          <div className="campo largo">
            <label htmlFor="forn-obs">Observações</label>
            <textarea
              id="forn-obs"
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

export default function Fornecedores() {
  const [lista, setLista] = useState<Fornecedor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('fornecedores')
      .select('id, nome, documento, telefone, observacoes, ativo')
      .order('nome')
    if (error) setErro('Não foi possível carregar os fornecedores. Recarregue a página.')
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

  async function criar(d: Dados) {
    limparMensagens()
    const { error } = await supabase.from('fornecedores').insert(paraBanco(d))
    if (error) {
      setErro(mensagemDeErro(error.code))
      return false
    }
    setCriando(false)
    setAviso('Fornecedor cadastrado.')
    carregar()
    return true
  }

  async function salvarEdicao(id: string, d: Dados) {
    limparMensagens()
    const { data, error } = await supabase
      .from('fornecedores')
      .update(paraBanco(d))
      .eq('id', id)
      .select('id')
    if (error) {
      setErro(mensagemDeErro(error.code))
      return false
    }
    if (!data || data.length === 0) {
      setErro('Não foi possível salvar as alterações.')
      return false
    }
    setEditandoId(null)
    setAviso('Alterações salvas.')
    carregar()
    return true
  }

  async function alternar(f: Fornecedor) {
    limparMensagens()
    if (f.ativo) {
      const confirmou = window.confirm(
        `Desativar "${f.nome}"?\n\nAs contas antigas continuam com este fornecedor. Ele só deixa de aparecer para novos lançamentos. Você pode reativar quando quiser.`,
      )
      if (!confirmou) return
    }
    const { error } = await supabase.from('fornecedores').update({ ativo: !f.ativo }).eq('id', f.id)
    if (error) {
      setErro(mensagemDeErro(error.code))
      return
    }
    setAviso(f.ativo ? `"${f.nome}" foi desativado.` : `"${f.nome}" foi reativado.`)
    carregar()
  }

  async function excluir(f: Fornecedor) {
    limparMensagens()
    const confirmou = window.confirm(
      `Excluir "${f.nome}" de vez?\n\nIsso só é possível se ele nunca foi usado em nenhuma conta. Esta ação não pode ser desfeita.`,
    )
    if (!confirmou) return

    const { data, error } = await supabase.from('fornecedores').delete().eq('id', f.id).select('id')
    if (error) {
      setErro(
        error.code === '23503'
          ? `Não é possível excluir "${f.nome}" porque ele já está em uso em contas a pagar. Use "Desativar" no lugar.`
          : mensagemDeErro(error.code),
      )
      return
    }
    if (!data || data.length === 0) {
      setErro(`Não foi possível excluir "${f.nome}".`)
      return
    }
    setAviso(`"${f.nome}" foi excluído.`)
    carregar()
  }

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return lista
    return lista.filter(
      (f) => f.nome.toLowerCase().includes(t) || (f.documento ?? '').toLowerCase().includes(t),
    )
  }, [lista, busca])

  if (carregando) return <p>Carregando fornecedores...</p>

  return (
    <>
      <h2>Fornecedores</h2>
      <p>
        Quem vende para o sítio. Ao lançar uma despesa, você poderá escolher o fornecedor e, nas
        contas a pagar, filtrar por ele. Nada em uso é apagado: quando não comprar mais de alguém,
        desative-o.
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
          titulo="Novo fornecedor"
          inicial={VAZIO}
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
            + Novo fornecedor
          </button>
        </div>
      )}

      {lista.length > 0 && (
        <div className="bloco">
          <label htmlFor="forn-busca">Procurar fornecedor</label>
          <input
            id="forn-busca"
            type="text"
            placeholder="Digite parte do nome ou do CPF/CNPJ"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      )}

      {lista.length === 0 && <p className="bloco">Nenhum fornecedor cadastrado ainda.</p>}
      {lista.length > 0 && visiveis.length === 0 && (
        <p className="bloco">Nenhum fornecedor encontrado com essa busca.</p>
      )}

      {visiveis.map((f) =>
        editandoId === f.id ? (
          <Formulario
            key={f.id}
            titulo="Editar fornecedor"
            inicial={{
              nome: f.nome,
              documento: f.documento ?? '',
              telefone: f.telefone ?? '',
              observacoes: f.observacoes ?? '',
            }}
            aoSalvar={(d) => salvarEdicao(f.id, d)}
            aoCancelar={() => setEditandoId(null)}
          />
        ) : (
          <section className="forn-card" key={f.id}>
            <div className="item-linha">
              <div className="item-info">
                <span className={f.ativo ? 'forn-nome' : 'forn-nome desativado'}>{f.nome}</span>
                {!f.ativo && <span className="selo inativa">Desativado</span>}
              </div>
              <div className="item-acoes">
                <button
                  className="botao-texto"
                  type="button"
                  onClick={() => {
                    limparMensagens()
                    setCriando(false)
                    setEditandoId(f.id)
                  }}
                >
                  Editar
                </button>
                <button className="botao-texto" type="button" onClick={() => alternar(f)}>
                  {f.ativo ? 'Desativar' : 'Reativar'}
                </button>
                <button className="botao-texto perigo" type="button" onClick={() => excluir(f)}>
                  Excluir
                </button>
              </div>
            </div>
            {(f.documento || f.telefone) && (
              <p className="forn-dados">
                {f.documento && <span>CPF/CNPJ: {f.documento}</span>}
                {f.telefone && <span>Telefone: {f.telefone}</span>}
              </p>
            )}
            {f.observacoes && <p className="nota">{f.observacoes}</p>}
          </section>
        ),
      )}
    </>
  )
}