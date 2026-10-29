import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { baixarArquivo, gerarXlsx } from '../lib/planilha'
import type { Celula, Coluna } from '../lib/planilha'
import { formatarTamanho, hojeISO } from '../lib/formatar'

type Item = { id: string; nome: string }
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
  contas_pagar: {
    descricao: string
    categoria_id: string
    subcategoria_id: string | null
    fornecedor_id: string | null
    data_vencimento: string
    valor_original: number
  }
}
type ContaSit = { id: string; status: string; total_pago: number }

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const TIPOS: Record<string, string> = {
  nota_fiscal: 'Nota fiscal',
  boleto: 'Boleto',
  comprovante: 'Comprovante',
  outro: 'Outro',
}
const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }
const LIMITE_BYTES = 300 * 1024 * 1024

const COLUNAS: Coluna[] = [
  { titulo: 'Arquivo no ZIP', tipo: 'texto' },
  { titulo: 'Tipo do documento', tipo: 'texto' },
  { titulo: 'Conferida', tipo: 'sim' },
  { titulo: 'Enviado em', tipo: 'data' },
  { titulo: 'Conta', tipo: 'texto' },
  { titulo: 'Fornecedor', tipo: 'texto' },
  { titulo: 'Categoria', tipo: 'texto' },
  { titulo: 'Subcategoria', tipo: 'texto' },
  { titulo: 'Vencimento', tipo: 'data' },
  { titulo: 'Valor da conta (R$)', tipo: 'din' },
  { titulo: 'Total pago (R$)', tipo: 'din' },
  { titulo: 'Situação da conta', tipo: 'texto' },
  { titulo: 'Nome original do arquivo', tipo: 'texto' },
  { titulo: 'Tamanho (KB)', tipo: 'qtd' },
]

async function paginar<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const tudo: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await pagina(de, de + 999)
    if (error) throw new Error('falha')
    const lote = (data ?? []) as T[]
    tudo.push(...lote)
    if (lote.length < 1000) break
  }
  return tudo
}

const limpar = (t: string, max: number) =>
  t.replace(/[^\p{L}\p{N} ._-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim()

const mapa = (l: Item[]) => Object.fromEntries(l.map((i) => [i.id, i.nome])) as Record<string, string>

function data(iso: string): Date {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

// Data de envio no horário de Brasília.
function dataBrasilia(iso: string): Date {
  return data(new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso)))
}

export default function DocumentosAno() {
  const anoAtual = Number(hojeISO().slice(0, 4))
  const anos = Array.from({ length: 8 }, (_, i) => anoAtual + 1 - i)

  const [ano, setAno] = useState(anoAtual)
  const [mes, setMes] = useState('todos')
  const [cats, setCats] = useState<Item[]>([])
  const [subs, setSubs] = useState<Item[]>([])
  const [forns, setForns] = useState<Item[]>([])
  const [pronto, setPronto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('categorias').select('id, nome'),
      supabase.from('subcategorias').select('id, nome'),
      supabase.from('fornecedores').select('id, nome'),
    ]).then(([c, s, f]) => {
      if (c.error || s.error || f.error) {
        setErro('Não foi possível carregar os cadastros. Recarregue a página.')
        return
      }
      setCats(c.data)
      setSubs(s.data)
      setForns(f.data)
      setPronto(true)
    })
  }, [])

  async function gerar() {
    setErro('')
    setAviso('')
    setProgresso('')
    setOcupado(true)
    try {
      const mm = mes === 'todos' ? null : Number(mes)
      const ini = mm ? `${ano}-${String(mm).padStart(2, '0')}-01` : `${ano}-01-01`
      const ultimo = mm ? new Date(Date.UTC(ano, mm, 0)).getUTCDate() : 31
      const fim = mm ? `${ano}-${String(mm).padStart(2, '0')}-${ultimo}` : `${ano}-12-31`

      setProgresso('Procurando os documentos...')
      const [docsBrutos, sits] = await Promise.all([
        paginar<Doc>((i, j) =>
          supabase
            .from('documentos')
            .select(
              'id, conta_pagar_id, storage_path, nome_original, mime_type, tamanho_bytes, enviado_em, tipo, conferido, contas_pagar!inner(descricao, categoria_id, subcategoria_id, fornecedor_id, data_vencimento, valor_original)',
            )
            .gte('contas_pagar.data_vencimento', ini)
            .lte('contas_pagar.data_vencimento', fim)
            .order('id')
            .range(i, j),
        ),
        paginar<ContaSit>((i, j) =>
          supabase
            .from('v_contas_pagar')
            .select('id, status, total_pago')
            .gte('data_vencimento', ini)
            .lte('data_vencimento', fim)
            .order('id')
            .range(i, j),
        ),
      ])

      if (docsBrutos.length === 0) {
        setAviso('Não há documentos anexados neste período. Nenhum arquivo foi gerado.')
        return
      }

      const total = docsBrutos.reduce((t, d) => t + Number(d.tamanho_bytes), 0)
      if (total > LIMITE_BYTES) {
        setErro(
          `Os documentos deste período somam ${formatarTamanho(total)}, mais do que o limite de ${formatarTamanho(LIMITE_BYTES)} para gerar o ZIP de uma vez. Escolha um mês de cada vez.`,
        )
        return
      }

      const docs = [...docsBrutos].sort(
        (a, b) =>
          a.contas_pagar.data_vencimento.localeCompare(b.contas_pagar.data_vencimento) ||
          a.enviado_em.localeCompare(b.enviado_em),
      )
      const sit: Record<string, ContaSit> = Object.fromEntries(sits.map((s) => [s.id, s]))
      const nCat = mapa(cats)
      const nSub = mapa(subs)
      const nForn = mapa(forns)

      // Baixa 4 arquivos por vez.
      const blobs: (Blob | null)[] = new Array<Blob | null>(docs.length).fill(null)
      let proximo = 0
      let feitos = 0
      const trabalhador = async () => {
        while (proximo < docs.length) {
          const i = proximo++
          const r = await supabase.storage.from('documentos').download(docs[i].storage_path)
          blobs[i] = r.error || !r.data ? null : r.data
          feitos++
          setProgresso(`Baixando documentos: ${feitos} de ${docs.length}...`)
        }
      }
      await Promise.all(Array.from({ length: 4 }, trabalhador))

      setProgresso('Montando o ZIP...')
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const linhas: Celula[][] = []
      let falhas = 0

      docs.forEach((d, i) => {
        const c = d.contas_pagar
        const forn = c.fornecedor_id ? (nForn[c.fornecedor_id] ?? '') : ''
        const caminho = `${c.data_vencimento.slice(0, 7)}/${String(i + 1).padStart(3, '0')} - ${limpar(
          TIPOS[d.tipo] ?? 'Documento',
          20,
        )} - ${limpar(forn || 'Sem fornecedor', 30)} - ${limpar(c.descricao, 40)}.${EXT[d.mime_type] ?? 'bin'}`

        const blob = blobs[i]
        if (blob) zip.file(caminho, blob)
        else falhas++

        const s = sit[d.conta_pagar_id]
        linhas.push([
          blob ? caminho : 'NÃO BAIXADO (erro ao ler o arquivo)',
          TIPOS[d.tipo] ?? d.tipo,
          d.conferido ? 'Sim' : 'Não',
          dataBrasilia(d.enviado_em),
          c.descricao,
          forn || null,
          nCat[c.categoria_id] ?? null,
          c.subcategoria_id ? (nSub[c.subcategoria_id] ?? null) : null,
          data(c.data_vencimento),
          Number(c.valor_original),
          s ? Number(s.total_pago) : null,
          s?.status ?? null,
          d.nome_original,
          Math.round(Number(d.tamanho_bytes) / 1024),
        ])
      })

      zip.file('indice.xlsx', await gerarXlsx('Índice dos documentos', COLUNAS, linhas))
      const saida = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
      baixarArquivo(`documentos_${ano}${mm ? `-${String(mm).padStart(2, '0')}` : ''}.zip`, saida)

      setAviso(
        `ZIP gerado com ${docs.length - falhas} documentos e o índice.` +
          (falhas > 0
            ? ` Atenção: ${falhas} arquivo(s) não puderam ser lidos e estão marcados no índice. Tente gerar de novo.`
            : ''),
      )
    } catch {
      setErro('Não foi possível gerar o ZIP. Verifique a internet e tente de novo.')
    } finally {
      setProgresso('')
      setOcupado(false)
    }
  }

  return (
    <>
      <h2>Documentos para o imposto de renda</h2>
      <p>
        Gera um arquivo ZIP com todas as notas fiscais, boletos e comprovantes das contas do
        período, separados em pastas por mês, mais uma planilha (indice.xlsx) que liga cada arquivo
        à sua conta, ao fornecedor e ao valor.
      </p>

      <section className="bloco">
        <div className="grade">
          <div className="campo">
            <label htmlFor="da-ano">Ano do vencimento da conta</label>
            <select id="da-ano" value={ano} onChange={(e) => setAno(Number(e.target.value))}>
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="da-mes">Mês</label>
            <select id="da-mes" value={mes} onChange={(e) => setMes(e.target.value)}>
              <option value="todos">Ano inteiro</option>
              {MESES.map((n, i) => (
                <option key={n} value={i + 1}>
                  {n}
                </option>
              ))}
            </select>
            <span className="dica">Se o ano inteiro for grande demais, baixe um mês de cada vez.</span>
          </div>
        </div>

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
        {progresso && <p className="nota">{progresso}</p>}

        <button className="botao" type="button" disabled={!pronto || ocupado} onClick={gerar}>
          {ocupado ? 'Gerando o ZIP...' : 'Baixar documentos (ZIP)'}
        </button>
        <p className="nota">
          Vale pelo vencimento da conta. Documentos de contas canceladas também entram, e o índice
          mostra a situação. Pode demorar alguns minutos se houver muitos arquivos: não feche a
          página.
        </p>
      </section>
    </>
  )
}