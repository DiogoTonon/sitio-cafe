import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { supabase } from '../lib/supabase'
import { formatarDataHora, formatarTamanho } from '../lib/formatar'

type Documento = {
  id: string
  storage_path: string
  nome_original: string
  mime_type: string
  tamanho_bytes: number
  enviado_em: string
  tipo: string
}

const LIMITE_BYTES = 10 * 1024 * 1024
const COMPRIMIR_ACIMA = 400 * 1024
const MAX_LADO = 2000

const TIPOS: Record<string, string> = {
  nota_fiscal: 'Nota fiscal',
  boleto: 'Boleto',
  comprovante: 'Comprovante',
  outro: 'Outro',
}

const EXTENSAO: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}
const TIPO_POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

function tipoDoArquivo(arq: File): string {
  if (EXTENSAO[arq.type]) return arq.type
  const ext = arq.name.split('.').pop()?.toLowerCase() ?? ''
  return TIPO_POR_EXTENSAO[ext] ?? ''
}

async function prepararImagem(arq: File, tipo: string): Promise<{ blob: Blob; tipo: string }> {
  const original = { blob: arq as Blob, tipo }
  if (tipo === 'application/pdf' || arq.size <= COMPRIMIR_ACIMA) return original

  try {
    const imagem = await createImageBitmap(arq, { imageOrientation: 'from-image' })
    const escala = Math.min(1, MAX_LADO / Math.max(imagem.width, imagem.height))
    const largura = Math.round(imagem.width * escala)
    const altura = Math.round(imagem.height * escala)

    const quadro = document.createElement('canvas')
    quadro.width = largura
    quadro.height = altura
    const contexto = quadro.getContext('2d')
    if (!contexto) return original

    contexto.fillStyle = '#ffffff'
    contexto.fillRect(0, 0, largura, altura)
    contexto.drawImage(imagem, 0, 0, largura, altura)
    imagem.close()

    const reduzida = await new Promise<Blob | null>((resolve) =>
      quadro.toBlob(resolve, 'image/jpeg', 0.82),
    )
    if (reduzida && reduzida.size < arq.size) return { blob: reduzida, tipo: 'image/jpeg' }
  } catch {
    
  }
  return original
}

function nomeFinal(nome: string, tipoFinal: string): string {
  if (tipoFinal === 'image/jpeg' && !/\.jpe?g$/i.test(nome)) {
    return nome.replace(/\.[^.]+$/, '') + '.jpg'
  }
  return nome
}

type Props = { contaId: string; cancelada: boolean }

export default function Anexos({ contaId, cancelada }: Props) {
  const campoArquivo = useRef<HTMLInputElement>(null)
  const [lista, setLista] = useState<Documento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [tipoEnvio, setTipoEnvio] = useState('nota_fiscal')

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('documentos')
      .select('id, storage_path, nome_original, mime_type, tamanho_bytes, enviado_em, tipo')
      .eq('conta_pagar_id', contaId)
      .order('enviado_em', { ascending: false })
    if (error) setErro('Não foi possível carregar os documentos. Recarregue a página.')
    else setLista(data)
    setCarregando(false)
  }, [contaId])

  useEffect(() => {
    carregar()
  }, [carregar])

  
  async function enviarUm(arq: File): Promise<string | null> {
    const tipo = tipoDoArquivo(arq)
    if (!tipo) return 'formato não aceito. Envie PDF, JPG ou PNG.'
    if (arq.size === 0) return 'o arquivo está vazio.'

    const preparado = await prepararImagem(arq, tipo)
    if (preparado.blob.size > LIMITE_BYTES) {
      return 'o arquivo passa de 10 MB. Reduza o tamanho e tente de novo.'
    }

    const caminho = `${contaId}/${crypto.randomUUID()}.${EXTENSAO[preparado.tipo]}`

    const envio = await supabase.storage
      .from('documentos')
      .upload(caminho, preparado.blob, { contentType: preparado.tipo, upsert: false })
    if (envio.error) return 'não foi possível enviar. Verifique a internet e tente de novo.'

    const registro = await supabase
      .from('documentos')
      .insert({
        conta_pagar_id: contaId,
        storage_path: caminho,
        nome_original: nomeFinal(arq.name, preparado.tipo),
        mime_type: preparado.tipo,
        tamanho_bytes: preparado.blob.size,
        tipo: tipoEnvio,
      })
      .select('id')

    if (registro.error || !registro.data || registro.data.length === 0) {
      
      await supabase.storage.from('documentos').remove([caminho])
      return 'não foi possível registrar o documento. Tente de novo.'
    }
    return null
  }

  async function aoEscolher(evento: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(evento.target.files ?? [])
    evento.target.value = ''
    if (arquivos.length === 0) return

    setErro('')
    setAviso('')
    setEnviando(true)

    const falhas: string[] = []
    let enviados = 0
    for (const arq of arquivos) {
      const motivo = await enviarUm(arq)
      if (motivo) falhas.push(`"${arq.name}": ${motivo}`)
      else enviados++
    }

    setEnviando(false)
    if (enviados > 0) {
      setAviso(enviados === 1 ? 'Documento enviado.' : `${enviados} documentos enviados.`)
    }
    if (falhas.length > 0) setErro(falhas.join('\n'))
    await carregar()
  }

  async function abrir(doc: Documento, baixar: boolean) {
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
      setErro('O navegador bloqueou a abertura. Use o botão "Baixar" ou permita janelas deste site.')
    }
  }

  async function excluir(doc: Documento) {
    setErro('')
    setAviso('')
    const confirmou = window.confirm(
      `Excluir o documento "${doc.nome_original}" de vez?\n\nO arquivo será apagado e não poderá ser recuperado. A exclusão fica registrada no histórico.`,
    )
    if (!confirmou) return

    const { data, error } = await supabase.from('documentos').delete().eq('id', doc.id).select('id')
    if (error || !data || data.length === 0) {
      setErro('Não foi possível excluir o documento.')
      return
    }

    const remocao = await supabase.storage.from('documentos').remove([doc.storage_path])
    if (remocao.error) {
      setAviso(
        'O documento saiu desta conta, mas o arquivo pode ter ficado guardado no armazenamento. Avise quem cuida do sistema.',
      )
    } else {
      setAviso('Documento excluído.')
    }
    await carregar()
  }

  return (
    <section className="bloco">
      <h2>Notas fiscais e documentos</h2>

      {erro && (
        <p className="erro" role="alert" style={{ whiteSpace: 'pre-line' }}>
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
      ) : lista.length === 0 ? (
        <p className="nota">Nenhum documento anexado ainda.</p>
      ) : (
        <ul className="doc-lista">
          {lista.map((doc) => (
            <li className="doc-item" key={doc.id}>
              <div>
                <span className="doc-nome">{doc.nome_original}</span>
                <span className="doc-meta">
                  {TIPOS[doc.tipo] ?? 'Documento'} ·{' '}
                  {doc.mime_type === 'application/pdf' ? 'PDF' : 'Foto'} ·{' '}
                  {formatarTamanho(doc.tamanho_bytes)} · enviado em {formatarDataHora(doc.enviado_em)}
                </span>
              </div>
              <div className="item-acoes">
                <button className="botao-texto" type="button" onClick={() => abrir(doc, false)}>
                  Ver
                </button>
                <button className="botao-texto" type="button" onClick={() => abrir(doc, true)}>
                  Baixar
                </button>
                {!cancelada && (
                  <button className="botao-texto perigo" type="button" onClick={() => excluir(doc)}>
                    Excluir
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {cancelada ? (
        <p className="nota">Esta conta está cancelada e não aceita novos documentos.</p>
      ) : (
        <>
          <input
            ref={campoArquivo}
            type="file"
            hidden
            multiple
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            onChange={aoEscolher}
          />
          <div className="linha">
            <div className="doc-tipo">
              <label htmlFor="tipo-envio">Tipo do documento</label>
              <select
                id="tipo-envio"
                value={tipoEnvio}
                onChange={(e) => setTipoEnvio(e.target.value)}
              >
                {Object.entries(TIPOS).map(([codigo, nome]) => (
                  <option key={codigo} value={codigo}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="botao-pequeno"
              type="button"
              disabled={enviando}
              onClick={() => campoArquivo.current?.click()}
            >
              {enviando ? 'Enviando...' : '+ Anexar documento'}
            </button>
          </div>
          <p className="nota">
            Aceita PDF, JPG e PNG, até 10 MB cada. No celular, você pode tirar a foto na hora.
            Fotos grandes são reduzidas automaticamente.
          </p>
        </>
      )}
    </section>
  )
}