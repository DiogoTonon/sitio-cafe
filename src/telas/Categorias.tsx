import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { supabase } from '../lib/supabase'

type Unidade = { codigo: string; nome: string; simbolo: string }
type Categoria = {
  id: string
  nome: string
  ativa: boolean
  eh_encargos: boolean
  unidade_codigo: string | null
}
type Subcategoria = {
  id: string
  categoria_id: string
  nome: string
  ativa: boolean
  unidade_codigo: string | null
}

function mensagemDeErro(codigo?: string) {
  if (codigo === '23505') return 'Já existe um item com esse nome. Escolha outro nome.'
  return 'Não foi possível salvar. Verifique a internet e tente de novo.'
}

function SeletorUnidade(props: {
  id?: string
  rotulo?: string
  valor: string
  vazio: string
  unidades: Unidade[]
  aoMudar: (valor: string) => void
}) {
  return (
    <select
      id={props.id}
      aria-label={props.rotulo}
      value={props.valor}
      onChange={(e) => props.aoMudar(e.target.value)}
    >
      <option value="">{props.vazio}</option>
      {props.unidades.map((u) => (
        <option key={u.codigo} value={u.codigo}>
          {u.nome} ({u.simbolo})
        </option>
      ))}
    </select>
  )
}

function ItemEditavel(props: {
  nivel: 'categoria' | 'sub'
  nome: string
  unidadeCodigo: string | null
  textoUnidade: string
  unidades: Unidade[]
  ativa: boolean
  especial?: boolean
  extra?: ReactNode
  aoSalvar: (nome: string, unidade: string | null) => Promise<boolean>
  aoAlternar: () => Promise<void>
  aoExcluir: () => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(props.nome)
  const [unidade, setUnidade] = useState(props.unidadeCodigo ?? '')

  function comecarEdicao() {
    setNome(props.nome)
    setUnidade(props.unidadeCodigo ?? '')
    setEditando(true)
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    const deuCerto = await props.aoSalvar(nome, unidade || null)
    if (deuCerto) setEditando(false)
  }

  if (editando) {
    return (
      <form className={`item-linha item-${props.nivel}`} onSubmit={salvar}>
        <input
          type="text"
          aria-label="Novo nome"
          required
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
        <SeletorUnidade
          rotulo="Unidade de medida"
          valor={unidade}
          vazio={props.nivel === 'sub' ? 'Mesma unidade da categoria' : 'Sem unidade de medida'}
          unidades={props.unidades}
          aoMudar={setUnidade}
        />
        <button className="botao-pequeno" type="submit">
          Salvar
        </button>
        <button
          className="botao-pequeno secundario"
          type="button"
          onClick={() => setEditando(false)}
        >
          Cancelar
        </button>
      </form>
    )
  }

  return (
    <div className={`item-linha item-${props.nivel}`}>
      <div className="item-info">
        {props.nivel === 'sub' && <span aria-hidden="true">↳</span>}
        <span className={props.ativa ? 'item-nome' : 'item-nome desativado'}>{props.nome}</span>
        {!props.ativa && <span className="selo inativa">Desativada</span>}
        {props.textoUnidade && <span className="selo unidade">{props.textoUnidade}</span>}
      </div>
      <div className="item-acoes">
        {props.extra}
        {props.especial ? (
          <span className="nota">Categoria especial do sistema</span>
        ) : (
          <>
            <button className="botao-texto" type="button" onClick={comecarEdicao}>
              Editar
            </button>
            <button className="botao-texto" type="button" onClick={props.aoAlternar}>
              {props.ativa ? 'Desativar' : 'Reativar'}
            </button>
            <button className="botao-texto perigo" type="button" onClick={props.aoExcluir}>
              Excluir
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function Categorias() {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subs, setSubs] = useState<Subcategoria[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [novaCategoria, setNovaCategoria] = useState('')
  const [novaUnidade, setNovaUnidade] = useState('')
  const [novasSubs, setNovasSubs] = useState<Record<string, string>>({})
  const [novasSubUnidades, setNovasSubUnidades] = useState<Record<string, string>>({})
  const [abertas, setAbertas] = useState<Record<string, boolean>>({})

  const carregar = useCallback(async () => {
    const [c, s, u] = await Promise.all([
      supabase
        .from('categorias')
        .select('id, nome, ativa, eh_encargos, unidade_codigo')
        .order('nome'),
      supabase
        .from('subcategorias')
        .select('id, categoria_id, nome, ativa, unidade_codigo')
        .order('nome'),
      supabase.from('unidades_medida').select('codigo, nome, simbolo').order('nome'),
    ])
    if (c.error || s.error || u.error) {
      setErro('Não foi possível carregar as categorias. Recarregue a página.')
    } else {
      setCategorias(c.data)
      setSubs(s.data)
      setUnidades(u.data)
    }
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const rotuloUnidade = useMemo(() => {
    const mapa: Record<string, string> = {}
    unidades.forEach((u) => (mapa[u.codigo] = `${u.nome} (${u.simbolo})`))
    return mapa
  }, [unidades])

  function limparMensagens() {
    setErro('')
    setAviso('')
  }

  async function criarCategoria(evento: FormEvent) {
    evento.preventDefault()
    limparMensagens()
    const { error } = await supabase
      .from('categorias')
      .insert({ nome: novaCategoria.trim(), unidade_codigo: novaUnidade || null })
    if (error) {
      setErro(mensagemDeErro(error.code))
      return
    }
    setNovaCategoria('')
    setNovaUnidade('')
    setAviso('Categoria criada.')
    carregar()
  }

  async function criarSub(categoriaId: string, evento: FormEvent) {
    evento.preventDefault()
    limparMensagens()
    const nome = (novasSubs[categoriaId] ?? '').trim()
    const unidade = novasSubUnidades[categoriaId] || null
    const { error } = await supabase
      .from('subcategorias')
      .insert({ categoria_id: categoriaId, nome, unidade_codigo: unidade })
    if (error) {
      setErro(mensagemDeErro(error.code))
      return
    }
    setNovasSubs({ ...novasSubs, [categoriaId]: '' })
    setNovasSubUnidades({ ...novasSubUnidades, [categoriaId]: '' })
    setAviso('Subcategoria criada.')
    carregar()
  }

  async function salvarEdicao(
    tabela: 'categorias' | 'subcategorias',
    id: string,
    nome: string,
    unidade: string | null,
  ) {
    limparMensagens()
    const { data, error } = await supabase
      .from(tabela)
      .update({ nome: nome.trim(), unidade_codigo: unidade })
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
    setAviso('Alterações salvas. A nova unidade vale para os próximos lançamentos.')
    carregar()
    return true
  }

  async function alternar(
    tabela: 'categorias' | 'subcategorias',
    id: string,
    nome: string,
    ativa: boolean,
  ) {
    limparMensagens()
    if (ativa) {
      const confirmou = window.confirm(
        `Desativar "${nome}"?\n\nOs lançamentos antigos continuam com ela. Ela só deixa de aparecer para novos lançamentos. Você pode reativar quando quiser.`,
      )
      if (!confirmou) return
    }
    const { error } = await supabase.from(tabela).update({ ativa: !ativa }).eq('id', id)
    if (error) {
      setErro(mensagemDeErro(error.code))
      return
    }
    setAviso(ativa ? `"${nome}" foi desativada.` : `"${nome}" foi reativada.`)
    carregar()
  }

  async function excluir(tabela: 'categorias' | 'subcategorias', id: string, nome: string) {
    limparMensagens()
    const confirmou = window.confirm(
      `Excluir "${nome}" de vez?\n\nIsso só é possível se ela nunca foi usada em nenhum lançamento. Esta ação não pode ser desfeita.`,
    )
    if (!confirmou) return

    const { data, error } = await supabase.from(tabela).delete().eq('id', id).select('id')

    if (error) {
      setErro(
        error.code === '23503'
          ? `Não é possível excluir "${nome}" porque ela já está em uso (em lançamentos ou com subcategorias dentro). Use "Desativar" no lugar.`
          : mensagemDeErro(error.code),
      )
      return
    }
    if (!data || data.length === 0) {
      setErro(`Não foi possível excluir "${nome}".`)
      return
    }
    setAviso(`"${nome}" foi excluída.`)
    carregar()
  }

  if (carregando) return <p>Carregando categorias...</p>

  return (
    <>
      <h2>Categorias</h2>
      <p>
        Categorias organizam as despesas e aparecem nos relatórios. Se uma categoria tiver
        unidade de medida (litro, quilo...), a despesa pergunta a quantidade e mostra o preço por
        unidade. Mudar a unidade vale só para os próximos lançamentos. Nada em uso é apagado:
        quando uma categoria não for mais usada, desative-a.
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

      <form className="bloco" onSubmit={criarCategoria}>
        <label htmlFor="nova-cat">Nova categoria</label>
        <div className="linha">
          <input
            id="nova-cat"
            type="text"
            required
            placeholder="Ex.: Embalagens"
            value={novaCategoria}
            onChange={(e) => setNovaCategoria(e.target.value)}
          />
          <SeletorUnidade
            rotulo="Unidade de medida da nova categoria"
            valor={novaUnidade}
            vazio="Sem unidade de medida"
            unidades={unidades}
            aoMudar={setNovaUnidade}
          />
          <button className="botao-pequeno" type="submit">
            Criar categoria
          </button>
        </div>
      </form>

      {categorias.map((cat) => {
        const filhas = subs.filter((s) => s.categoria_id === cat.id)
        const aberta = abertas[cat.id] === true
        return (
          <section className="cat-card" key={cat.id}>
            <ItemEditavel
              nivel="categoria"
              nome={cat.nome}
              unidadeCodigo={cat.unidade_codigo}
              textoUnidade={
                cat.unidade_codigo ? `Unidade: ${rotuloUnidade[cat.unidade_codigo] ?? ''}` : ''
              }
              unidades={unidades}
              ativa={cat.ativa}
              especial={cat.eh_encargos}
              aoSalvar={(nome, unidade) => salvarEdicao('categorias', cat.id, nome, unidade)}
              aoAlternar={() => alternar('categorias', cat.id, cat.nome, cat.ativa)}
              aoExcluir={() => excluir('categorias', cat.id, cat.nome)}
              extra={
                <button
                  className="botao-pequeno secundario"
                  type="button"
                  aria-expanded={aberta}
                  onClick={() => setAbertas({ ...abertas, [cat.id]: !aberta })}
                >
                  {aberta ? 'Esconder subcategorias' : `Subcategorias (${filhas.length})`}
                </button>
              }
            />

            {aberta && (
              <div className="sub-area">
                {filhas.length === 0 && <p className="nota">Nenhuma subcategoria ainda.</p>}
                {filhas.map((sub) => {
                  let texto = ''
                  if (sub.unidade_codigo) {
                    texto = `Unidade: ${rotuloUnidade[sub.unidade_codigo] ?? ''}`
                  } else if (cat.unidade_codigo) {
                    texto = `Unidade: ${rotuloUnidade[cat.unidade_codigo] ?? ''} (da categoria)`
                  }
                  return (
                    <ItemEditavel
                      key={sub.id}
                      nivel="sub"
                      nome={sub.nome}
                      unidadeCodigo={sub.unidade_codigo}
                      textoUnidade={texto}
                      unidades={unidades}
                      ativa={sub.ativa}
                      aoSalvar={(nome, unidade) =>
                        salvarEdicao('subcategorias', sub.id, nome, unidade)
                      }
                      aoAlternar={() => alternar('subcategorias', sub.id, sub.nome, sub.ativa)}
                      aoExcluir={() => excluir('subcategorias', sub.id, sub.nome)}
                    />
                  )
                })}

                <form className="linha" onSubmit={(e) => criarSub(cat.id, e)}>
                  <input
                    type="text"
                    aria-label={`Nova subcategoria de ${cat.nome}`}
                    placeholder={`Nova subcategoria de ${cat.nome}`}
                    value={novasSubs[cat.id] ?? ''}
                    onChange={(e) => setNovasSubs({ ...novasSubs, [cat.id]: e.target.value })}
                    required
                  />
                  <SeletorUnidade
                    rotulo={`Unidade da nova subcategoria de ${cat.nome}`}
                    valor={novasSubUnidades[cat.id] ?? ''}
                    vazio="Mesma unidade da categoria"
                    unidades={unidades}
                    aoMudar={(v) => setNovasSubUnidades({ ...novasSubUnidades, [cat.id]: v })}
                  />
                  <button className="botao-pequeno" type="submit">
                    Adicionar
                  </button>
                </form>
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}