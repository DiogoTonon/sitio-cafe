// Restaura um backup (ZIP gerado pelo sistema) em um banco do Supabase.
//
// Uso (PowerShell, dentro da pasta do projeto):
//   $env:DATABASE_URL = "postgresql://..."        (string do "Session pooler")
//   node restaurar.mjs C:\caminho\backup_2026-10-28_10h30.zip
//
// Para restaurar também os documentos (opcional):
//   $env:SUPABASE_URL = "https://SEU-PROJETO.supabase.co"
//   $env:SUPABASE_SERVICE_KEY = "chave secret do projeto de destino"
//
// ATENÇÃO: este script APAGA os dados do banco de destino e coloca os do backup no lugar.
// Se algo der errado no meio, tudo é desfeito e o banco fica como estava.
// A chave secret NUNCA deve ser colocada em arquivos do site.

import fs from 'node:fs'
import readline from 'node:readline/promises'
import JSZip from 'jszip'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

const arquivo = process.argv[2]
const dbUrl = process.env.DATABASE_URL
if (!arquivo || !dbUrl) {
  console.log('Uso: defina DATABASE_URL e rode: node restaurar.mjs caminho-do-backup.zip')
  process.exit(1)
}

// Ordem que respeita as ligações entre as tabelas.
const TABELAS = [
  'propriedade', 'configuracoes', 'unidades_medida', 'categorias', 'subcategorias',
  'tipos_receita', 'fornecedores', 'contas_pagar', 'pagamentos', 'contas_receber',
  'recebimentos', 'documentos', 'funcionarios', 'folhas', 'folha_itens', 'servicos_temp',
  'servico_dias', 'pagamentos_rh', 'historico_alteracoes',
]
const COLUNAS_DE_USUARIO = ['criado_por', 'alterado_por', 'conferido_por', 'enviado_por']

const zip = await JSZip.loadAsync(fs.readFileSync(arquivo))
const manifesto = JSON.parse(await zip.file('manifesto.json').async('string'))
const dados = {}
for (const t of TABELAS) {
  const f = zip.file(`dados/${t}.json`)
  if (!f) throw new Error(`Falta dados/${t}.json dentro do backup.`)
  dados[t] = JSON.parse(await f.async('string'))
}

console.log(`\nBackup de: ${manifesto.gerado_em}`)
console.log(`Projeto de destino (código): ${decodeURIComponent(new URL(dbUrl).username).replace('postgres.', '')}`)
console.log('Linhas no backup:', JSON.stringify(manifesto.linhas_por_tabela))
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const resposta = await rl.question('\nIsso APAGA os dados do banco de destino. Digite RESTAURAR para continuar: ')
rl.close()
if (resposta.trim() !== 'RESTAURAR') {
  console.log('Cancelado. Nada foi alterado.')
  process.exit(0)
}

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
await client.connect()

try {
  await client.query('begin')
  for (const t of TABELAS) await client.query(`alter table public.${t} disable trigger user`)
  await client.query(
    `truncate table ${TABELAS.map((t) => `public.${t}`).join(', ')} restart identity cascade`,
  )

  const usuarios = new Set((await client.query('select id from auth.users')).rows.map((r) => r.id))

  for (const t of TABELAS) {
    const cols = (
      await client.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER'
          order by ordinal_position`,
        [t],
      )
    ).rows.map((r) => r.column_name)
    const lista = cols.map((c) => `"${c}"`).join(', ')
    const extra = t === 'historico_alteracoes' ? ' overriding system value' : ''

    const linhas = dados[t].map((l) => {
      const o = { ...l }
      // Usuários que não existem no banco de destino ficam em branco.
      for (const c of COLUNAS_DE_USUARIO) if (o[c] && !usuarios.has(o[c])) o[c] = null
      return o
    })
    for (let i = 0; i < linhas.length; i += 500) {
      await client.query(
        `insert into public.${t} (${lista})${extra}
         select ${lista} from jsonb_populate_recordset(null::public.${t}, $1::jsonb)`,
        [JSON.stringify(linhas.slice(i, i + 500))],
      )
    }
    console.log(`  ${t}: ${linhas.length} linhas`)
  }

  await client.query(
    `select setval(pg_get_serial_sequence('public.historico_alteracoes', 'id'),
            greatest((select coalesce(max(id), 1) from public.historico_alteracoes), 1))`,
  )
  const m = await client.query(
    `insert into public.membros (user_id, nome) select id, email from auth.users on conflict do nothing`,
  )
  console.log(`  membros: ${m.rowCount} usuário(s) liberado(s) para acessar`)

  for (const t of TABELAS) await client.query(`alter table public.${t} enable trigger user`)
  await client.query('commit')
} catch (e) {
  await client.query('rollback')
  console.error('\nERRO. Tudo foi desfeito e o banco ficou como estava.\n', e.message)
  await client.end()
  process.exit(1)
}

// ---------- Conferência ----------
let ok = true
console.log('\nConferência das quantidades:')
for (const t of TABELAS) {
  const n = Number((await client.query(`select count(*) as n from public.${t}`)).rows[0].n)
  const esperado = manifesto.linhas_por_tabela[t]
  const bate = n === esperado
  if (!bate) ok = false
  console.log(`  ${bate ? 'OK  ' : 'ERRO'} ${t}: ${n} (backup: ${esperado})`)
}
const s = (
  await client.query(`select
    (select coalesce(sum(valor_pago), 0) from public.pagamentos) as a,
    (select coalesce(sum(valor), 0) from public.recebimentos) as b,
    (select coalesce(sum(valor), 0) from public.pagamentos_rh) as c,
    (select coalesce(sum(valor_original), 0) from public.contas_pagar) as d,
    (select coalesce(sum(valor_total), 0) from public.contas_receber) as e`)
).rows[0]
const alvo = manifesto.totais_para_conferencia
console.log('\nConferência dos valores:')
for (const [nome, atual, esperado] of [
  ['pagamentos (valor pago)', s.a, alvo.pagamentos_valor_pago],
  ['recebimentos', s.b, alvo.recebimentos_valor],
  ['pagamentos de funcionários', s.c, alvo.pagamentos_rh_valor],
  ['contas a pagar (valor original)', s.d, alvo.contas_pagar_valor_original],
  ['contas a receber (valor total)', s.e, alvo.contas_receber_valor_total],
]) {
  const bate = Math.abs(Number(atual) - Number(esperado)) < 0.005
  if (!bate) ok = false
  console.log(`  ${bate ? 'OK  ' : 'ERRO'} ${nome}: ${atual} (backup: ${esperado})`)
}
await client.end()

// ---------- Documentos (opcional) ----------
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  let enviados = 0
  let falhas = 0
  for (const d of dados.documentos) {
    const f = zip.file(`documentos/${d.storage_path}`)
    if (!f) {
      falhas++
      console.log(`  Documento ausente no backup: ${d.storage_path}`)
      continue
    }
    const { error } = await supa.storage
      .from('documentos')
      .upload(d.storage_path, await f.async('nodebuffer'), { contentType: d.mime_type, upsert: true })
    if (error) {
      falhas++
      console.log(`  Falha ao enviar ${d.storage_path}: ${error.message}`)
    } else {
      enviados++
    }
  }
  if (falhas > 0) ok = false
  console.log(`\nDocumentos: ${enviados} enviados, ${falhas} com problema.`)
} else {
  console.log('\nDocumentos: não restaurados (defina SUPABASE_URL e SUPABASE_SERVICE_KEY para restaurá-los).')
}

console.log(ok ? '\nRESTAURAÇÃO CONFERIDA: tudo bate com o backup.' : '\nATENÇÃO: há divergências acima.')
process.exit(ok ? 0 : 1)
