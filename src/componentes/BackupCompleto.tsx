import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { baixarArquivo } from '../lib/planilha'
import { formatarDataHora, formatarTamanho } from '../lib/formatar'

type Linha = Record<string, unknown>

const TABELAS = [
  { nome: 'propriedade', chave: 'id' },
  { nome: 'membros', chave: 'user_id' },
  { nome: 'configuracoes', chave: 'id' },
  { nome: 'categorias', chave: 'id' },
  { nome: 'subcategorias', chave: 'id' },
  { nome: 'tipos_receita', chave: 'id' },
  { nome: 'unidades_medida', chave: 'codigo' },
  { nome: 'fornecedores', chave: 'id' },
  { nome: 'contas_pagar', chave: 'id' },
  { nome: 'pagamentos', chave: 'id' },
  { nome: 'contas_receber', chave: 'id' },
  { nome: 'recebimentos', chave: 'id' },
  { nome: 'documentos', chave: 'id' },
  { nome: 'funcionarios', chave: 'id' },
  { nome: 'folhas', chave: 'id' },
  { nome: 'folha_itens', chave: 'id' },
  { nome: 'servicos_temp', chave: 'id' },
  { nome: 'servico_dias', chave: 'id' },
  { nome: 'pagamentos_rh', chave: 'id' },
  { nome: 'historico_alteracoes', chave: 'id' },
]
const LIMITE_BYTES = 300 * 1024 * 1024

async function copiar(tabela: string, chave: string): Promise<Linha[]> {
  const tudo: Linha[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from(tabela).select('*').order(chave).range(de, de + 999)
    if (error) throw new Error(`leitura de ${tabela}`)
    const lote = (data ?? []) as Linha[]
    tudo.push(...lote)
    if (lote.length < 1000) break
  }
  return tudo
}

const somaCentavos = (linhas: Linha[], campo: string) =>
  linhas.reduce((t, l) => t + Math.round(Number(l[campo] ?? 0) * 100), 0) / 100

const LEIA_ME = `BACKUP DO SISTEMA FINANCEIRO DO SÍTIO

Este arquivo é uma cópia de segurança de todos os dados do sistema.

O que tem aqui:
- dados/            Uma cópia de cada tabela do sistema, em arquivos .json.
- documentos/       Os arquivos anexados (notas fiscais, boletos, comprovantes), com os
                    mesmos caminhos que têm no sistema. Só existe se o backup foi feito
                    com a opção de documentos marcada.
- manifesto.json    Data do backup, quantidade de linhas de cada tabela e totais para
                    conferência.

Cuidados:
- Este arquivo NÃO tem senha. Quem o abrir enxerga todas as informações financeiras.
  Guarde em lugar privado.
- Guarde uma cópia FORA do computador (HD externo ou pen drive). Se o computador quebrar,
  um backup que estava só nele se perde junto.
- Faça um backup novo pelo menos uma vez por mês e antes de qualquer mudança grande.
- Não edite os arquivos .json: eles são a base para recuperar os dados.
- Para ler os dados em planilhas, use a tela Exportar do sistema.
`

export default function BackupCompleto() {
  const [incluir, setIncluir] = useState(true)
  const [ultimo, setUltimo] = useState<string | null>(null)
  const [docs, setDocs] = useState<{ qtd: number; bytes: number } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [progresso, setProgresso] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  useEffect(() => {
    supabase
      .from('configuracoes')
      .select('ultimo_backup')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => setUltimo((data?.ultimo_backup as string | null) ?? null))
    copiar('documentos', 'id')
      .then((l) =>
        setDocs({ qtd: l.length, bytes: l.reduce((s, d) => s + Number(d.tamanho_bytes ?? 0), 0) }),
      )
      .catch(() => setDocs(null))
  }, [])

  async function gerar() {
    setErro('')
    setAviso('')
    setOcupado(true)
    try {
      const dados: Record<string, Linha[]> = {}
      const problemas: string[] = []

      for (let k = 0; k < TABELAS.length; k++) {
        const t = TABELAS[k]
        setProgresso(`Copiando os dados (${k + 1} de ${TABELAS.length}): ${t.nome}...`)
        dados[t.nome] = await copiar(t.nome, t.chave)
        const { count, error } = await supabase
          .from(t.nome)
          .select('*', { count: 'exact', head: true })
        if (error || count === null) throw new Error(`contagem de ${t.nome}`)
        if (count !== dados[t.nome].length) {
          problemas.push(`${t.nome}: ${dados[t.nome].length} copiadas, ${count} existentes`)
        }
      }

      const registrados = dados.documentos
      const bytes = registrados.reduce((s, d) => s + Number(d.tamanho_bytes ?? 0), 0)
      if (incluir && bytes > LIMITE_BYTES) {
        setErro(
          `Os documentos somam ${formatarTamanho(bytes)}, mais que o limite de ${formatarTamanho(LIMITE_BYTES)} para gerar o ZIP de uma vez. Desmarque a opção de documentos e proteja-os com o ZIP por ano, acima.`,
        )
        return
      }

      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      for (const t of TABELAS) {
        zip.file(`dados/${t.nome}.json`, JSON.stringify(dados[t.nome]), { compression: 'DEFLATE' })
      }

      let incluidos = 0
      const semArquivo: string[] = []
      if (incluir) {
        let proximo = 0
        let feitos = 0
        const trabalhador = async () => {
          while (proximo < registrados.length) {
            const caminho = String(registrados[proximo++].storage_path)
            const r = await supabase.storage.from('documentos').download(caminho)
            if (r.error || !r.data) {
              semArquivo.push(caminho)
            } else {
              zip.file(`documentos/${caminho}`, r.data)
              incluidos++
            }
            feitos++
            setProgresso(`Copiando os documentos: ${feitos} de ${registrados.length}...`)
          }
        }
        await Promise.all(Array.from({ length: 4 }, trabalhador))
      }

      setProgresso('Montando o ZIP...')
      const agora = new Date()
      const manifesto = {
        versao: 1,
        gerado_em: agora.toISOString(),
        linhas_por_tabela: Object.fromEntries(TABELAS.map((t) => [t.nome, dados[t.nome].length])),
        documentos: {
          incluidos_no_backup: incluir,
          registrados: registrados.length,
          copiados: incluidos,
          bytes_registrados: bytes,
          nao_copiados: semArquivo,
        },
        totais_para_conferencia: {
          pagamentos_valor_pago: somaCentavos(dados.pagamentos, 'valor_pago'),
          recebimentos_valor: somaCentavos(dados.recebimentos, 'valor'),
          pagamentos_rh_valor: somaCentavos(dados.pagamentos_rh, 'valor'),
          contas_pagar_valor_original: somaCentavos(dados.contas_pagar, 'valor_original'),
          contas_receber_valor_total: somaCentavos(dados.contas_receber, 'valor_total'),
        },
        divergencias: problemas,
      }
      zip.file('manifesto.json', JSON.stringify(manifesto, null, 2), { compression: 'DEFLATE' })
      zip.file('LEIA-ME.txt', '\uFEFF' + LEIA_ME, { compression: 'DEFLATE' })

      const quando = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
        .format(agora)
        .replace(' ', '_')
        .replace(':', 'h')

      const saida = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
      baixarArquivo(`backup_${quando}.zip`, saida)

      if (problemas.length > 0 || semArquivo.length > 0) {
        setErro(
          `O backup foi baixado, mas a conferência encontrou problemas e ele NÃO foi registrado como concluído. ${
            problemas.length > 0 ? `Divergências: ${problemas.join('; ')}. ` : ''
          }${semArquivo.length > 0 ? `${semArquivo.length} documento(s) não puderam ser lidos. ` : ''}Tente de novo.`,
        )
        return
      }

      const reg = await supabase
        .from('configuracoes')
        .update({ ultimo_backup: agora.toISOString() })
        .eq('id', 1)
        .select('id')
      if (!reg.error && reg.data && reg.data.length > 0) setUltimo(agora.toISOString())

      setAviso(
        `Backup conferido e baixado: ${TABELAS.length} tabelas${
          incluir ? ` e ${incluidos} documentos` : ', sem os documentos'
        }. Copie o arquivo para um HD externo ou pen drive.`,
      )
    } catch {
      setErro('Não foi possível gerar o backup. Verifique a internet e tente de novo.')
    } finally {
      setProgresso('')
      setOcupado(false)
    }
  }

  return (
    <>
      <h2>Backup completo</h2>
      <p>
        Uma cópia de segurança de <strong>todos</strong> os dados do sistema, conferida
        automaticamente. Guarde o arquivo fora do computador.
      </p>

      <section className="bloco">
        <p>
          <strong>Último backup:</strong>{' '}
          {ultimo ? formatarDataHora(ultimo) : 'nenhum backup foi feito ainda'}
        </p>
        {docs && (
          <p className="nota">
            Documentos anexados hoje: {docs.qtd} arquivo(s), {formatarTamanho(docs.bytes)}.
          </p>
        )}

        <label className="opcao">
          <input type="checkbox" checked={incluir} onChange={(e) => setIncluir(e.target.checked)} />
          Incluir os documentos anexados (notas fiscais, boletos e comprovantes)
        </label>

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

        <button className="botao" type="button" disabled={ocupado} onClick={gerar}>
          {ocupado ? 'Gerando o backup...' : 'Fazer backup agora (ZIP)'}
        </button>
        <p className="nota">
          Pode demorar alguns minutos se houver muitos documentos: não feche a página. O arquivo não
          tem senha, então guarde-o em lugar privado.
        </p>
      </section>
    </>
  )
}