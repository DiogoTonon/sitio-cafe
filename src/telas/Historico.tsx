import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatarData, formatarDataHora, formatarTamanho, hojeISO } from '../lib/formatar'

type Doc = {
  id: string
  conta_pagar_id: string
  storage_path: string
  nome_original: string
  mime_type: string
  tamanho_bytes: number
  enviado_em: string
  tipo: string
  conferido: boolean
  conferido_em: string | null
  contas_pagar: {
    descricao: string
    categoria_id: string
    fornecedor_id: string | null
    data_vencimento: string
  }
}

const TIPOS: Record<string, string> = {
  nota_fiscal: 'Nota fiscal',
  boleto: 'Boleto',
  comprovante: 'Comprovante',
  outro: 'Outro',
}
const LIMITE = 300

export default function Historico() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([])
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const [fTipo, setFTipo] = useState('')
  const [fConf, setFConf] = useState('todas')
  const [fAno, setFAno] = useState('todos')
  const [fCat, setFCat] = useState('')
  const [fForn, setFForn] = useState('')

  const anoAtual = Number(hojeISO().slice(0, 4))
  const anos = Array.from({ length: 8 }, (_, i) => anoAtual + 1 - i)

  useEffect(() => {
    supabase
      .from('categorias')
      .select('id, nome')
      .order('nome')
      .then(({ data }) => setCategorias(data ?? []))
    supabase
      .from('fornecedores')
      .select('id, nome')
      .order('nome')
      .then(({ data }) => setFornecedores(data ?? []))
  }, [])

  const carregar = useCallback(async () => {
    setCarregando(true)
    let q = supabase
      .from('documentos')
      .select(
        'id, conta_pagar_id, storage_path, nome_original, mime_type, tamanho_bytes, enviado_em, tipo, conferido, conferido_em, contas_pagar!inner(descricao, categoria_id, fornecedor_id, data_vencimento)',
      )
      .order('enviado_em', { ascending: false })
      .limit(LIMITE)

    if (fTipo) q = q.eq('tipo', fTipo)
    if (fConf === 'sim') q = q.eq('conferido', true)
    if (fConf === 'nao') q = q.eq('conferido', false)
    if (fAno !== 'todos') {
      q = q
        .gte('contas_pagar.data_vencimento', `${fAno}-01-01`)
        .lte('contas_pagar.data_vencimento', `${fAno}-12-31`)
    }
    if (fCat) q = q.eq('contas_pagar.categoria_id', fCat)
    if (fForn === 'sem') q = q.is('contas_pagar.fornecedor_id', null)
    else if (fForn) q = q.eq('contas_pagar.fornecedor_id', fForn)

    const { data, error } = await q
    if (error) {
      setErro('Não foi possível carregar os documentos. Recarregue a página.')
      setDocs([])
    } else {
      setDocs(data as unknown as Doc[])
    }
    setCarregando(false)
  }, [fTipo, fConf, fAno, fCat, fForn])

  useEffect(() => {
    carregar()
  }, [carregar])

  const nomeCat = useMemo(() => {
    const m: Record<string, string> = {}
    categorias.forEach((c) => (m[c.id] = c.nome))
    return m
  }, [categorias])

  const nomeForn = useMemo(() => {
    const m: Record<string, string> = {}
    fornecedores.forEach((f) => (m[f.id] = f.nome))
    return m
  }, [fornecedores])

  function limpar() {
    setFTipo('')
    setFConf('todas')
    setFAno('todos')
    setFCat('')
    setFForn('')
  }

  async function abrir(doc: Doc, baixar: boolean) {
    setErro('')
    setAviso('')
    const janela = baixar ? null : window.open('', '_blank')
    const { data, error } = await supabase.storage
      .from('documentos')
      .createSignedUrl(doc.storage_path, 120, baixar ? { download: doc.nome_original } : undefined)
    if (error || !data) {
      janela?.close()
      setErro('Não foi possível abrir o documento agora. Tente de novo.')
      return
    }
    if (baixar) {
      const link = document.createElement('a')
      link.href = data.signedUrl
      link.download = doc.nome_original
      document.body.appendChild(link)
      link.click()
      link.remove()
    } else if (janela) {
      janela.location.href = data.signedUrl
    } else {
      setErro('O navegador bloqueou a abertura. Use o botão "Baixar".')
    }
  }

  async function alternarConferencia(doc: Doc) {
    setErro('')
    setAviso('')
    const { data, error } = await supabase
      .from('documentos')
      .update({ conferido: !doc.conferido })
      .eq('id', doc.id)
      .select('id, conferido, conferido_em')
    if (error || !data || data.length === 0) {
      setErro('Não foi possível alterar a conferência. Tente de novo.')
      return
    }
    const novo = data[0]
    setDocs((lista) =>
      lista.map((d) =>
        d.id === doc.id ? { ...d, conferido: novo.conferido, conferido_em: novo.conferido_em } : d,
      ),
    )
  }

  async function mudarTipo(doc: Doc, tipo: string) {
    setErro('')
    setAviso('')
    const { data, error } = await supabase
      .from('documentos')
      .update({ tipo })
      .eq('id', doc.id)
      .select('id')
    if (error || !data || data.length === 0) {
      setErro('Não foi possível mudar o tipo do documento.')
      return
    }
    setDocs((lista) => lista.map((d) => (d.id === doc.id ? { ...d, tipo } : d)))
  }

  const conferidos = docs.filter((d) => d.conferido).length

  return (
    <>
      <h2>Documentos anexados</h2>
      <p>
        Todas as notas fiscais, boletos e comprovantes anexados às despesas. Marque cada nota como
        conferida depois de verificar o documento.
      </p>

      <section className="bloco filtros">
        <div className="campo">
          <label htmlFor="h-tipo">Tipo de documento</label>
          <select id="h-tipo" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
            <option value="">Todos os tipos</option>
            {Object.entries(TIPOS).map(([codigo, nome]) => (
              <option key={codigo} value={codigo}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="h-conf">Conferência</label>
          <select id="h-conf" value={fConf} onChange={(e) => setFConf(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="nao">Não conferidas</option>
            <option value="sim">Conferidas</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="h-ano">Ano do vencimento da conta</label>
          <select id="h-ano" value={fAno} onChange={(e) => setFAno(e.target.value)}>
            <option value="todos">Todos os anos</option>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="h-cat">Categoria</label>
          <select id="h-cat" value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="h-forn">Fornecedor</label>
          <select id="h-forn" value={fForn} onChange={(e) => setFForn(e.target.value)}>
            <option value="">Todos os fornecedores</option>
            <option value="sem">Contas sem fornecedor</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="acoes-filtro">
          <button className="botao-pequeno secundario" type="button" onClick={limpar}>
            Limpar filtros
          </button>
        </div>
      </section>

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

      {carregando ? (
        <p>Carregando documentos...</p>
      ) : docs.length === 0 ? (
        <p className="bloco">Nenhum documento encontrado com esses filtros.</p>
      ) : (
        <>
          <div className="totais">
            <div>
              <span className="rotulo">Documentos listados</span>
              <strong>{docs.length}</strong>
            </div>
            <div>
              <span className="rotulo">Conferidos</span>
              <strong>{conferidos}</strong>
            </div>
            <div>
              <span className="rotulo">Falta conferir</span>
              <strong>{docs.length - conferidos}</strong>
            </div>
          </div>

          {docs.length >= LIMITE && (
            <p className="nota">Mostrando os {LIMITE} mais recentes. Use os filtros para ver os demais.</p>
          )}

          {docs.map((d) => (
            <section className="doc-card" key={d.id}>
              <div className="item-linha">
                <div>
                  <span className="doc-nome">{d.nome_original}</span>
                  <span className="doc-meta">
                    {formatarTamanho(d.tamanho_bytes)} · enviado em {formatarDataHora(d.enviado_em)}
                  </span>
                </div>
                <span className={d.conferido ? 'selo ativa' : 'selo inativa'}>
                  {d.conferido ? 'Conferida' : 'Não conferida'}
                </span>
              </div>

              <p className="doc-conta">
                Conta:{' '}
                <Link className="link-forte" to={`/contas-pagar/${d.conta_pagar_id}`}>
                  {d.contas_pagar.descricao}
                </Link>
                <span className="doc-meta">
                  {d.contas_pagar.fornecedor_id
                    ? (nomeForn[d.contas_pagar.fornecedor_id] ?? 'Fornecedor')
                    : 'Sem fornecedor'}{' '}
                  · {nomeCat[d.contas_pagar.categoria_id] ?? '—'} · vence em{' '}
                  {formatarData(d.contas_pagar.data_vencimento)}
                </span>
              </p>

              {d.conferido && d.conferido_em && (
                <p className="nota">Conferida em {formatarDataHora(d.conferido_em)}.</p>
              )}

              <div className="item-linha">
                <div className="doc-tipo">
                  <label htmlFor={`tipo-${d.id}`}>Tipo</label>
                  <select
                    id={`tipo-${d.id}`}
                    value={d.tipo}
                    onChange={(e) => mudarTipo(d, e.target.value)}
                  >
                    {Object.entries(TIPOS).map(([codigo, nome]) => (
                      <option key={codigo} value={codigo}>
                        {nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="item-acoes">
                  <button className="botao-texto" type="button" onClick={() => abrir(d, false)}>
                    Ver
                  </button>
                  <button className="botao-texto" type="button" onClick={() => abrir(d, true)}>
                    Baixar
                  </button>
                  <button
                    className={d.conferido ? 'botao-pequeno secundario' : 'botao-pequeno'}
                    type="button"
                    onClick={() => alternarConferencia(d)}
                  >
                    {d.conferido ? 'Desmarcar conferência' : 'Marcar como conferida'}
                  </button>
                </div>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  )
}