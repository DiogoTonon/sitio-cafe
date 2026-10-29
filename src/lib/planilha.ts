export type Tipo = 'texto' | 'data' | 'mes' | 'din' | 'pre' | 'qtd' | 'sim'
export type Celula = string | number | Date | null
export type Coluna = { titulo: string; tipo: Tipo }

const FORMATO: Partial<Record<Tipo, string>> = {
  data: 'dd/mm/yyyy',
  mes: 'mm/yyyy',
  din: '"R$" #,##0.00',
  pre: '"R$" #,##0.0000',
}
const MIN: Record<Tipo, number> = { texto: 14, data: 13, mes: 11, din: 16, pre: 18, qtd: 11, sim: 9 }
const MAX: Record<Tipo, number> = { texto: 50, data: 13, mes: 11, din: 22, pre: 22, qtd: 16, sim: 9 }
const HORIZONTAL: Record<Tipo, 'left' | 'center' | 'right'> = {
  texto: 'left',
  data: 'center',
  mes: 'center',
  din: 'right',
  pre: 'right',
  qtd: 'right',
  sim: 'center',
}

function tamanho(v: Celula, tipo: Tipo): number {
  if (v === null) return 0
  if (v instanceof Date) return 12
  if (typeof v === 'number') {
    const casas = tipo === 'din' ? 2 : tipo === 'pre' ? 4 : 0
    const texto = v.toLocaleString('pt-BR', {
      minimumFractionDigits: casas,
      maximumFractionDigits: tipo === 'qtd' ? 3 : casas,
    })
    return texto.length + (tipo === 'din' || tipo === 'pre' ? 4 : 0)
  }
  return v.length
}

export async function gerarXlsx(
  aba: string,
  colunas: Coluna[],
  linhas: Celula[][],
) {
  const mod = await import('exceljs')
  const Workbook = mod.Workbook ?? (mod as unknown as { default: typeof mod }).default.Workbook
  const wb = new Workbook()
  const ws = wb.addWorksheet(aba.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))

  ws.addRow(colunas.map((c) => c.titulo))
  linhas.forEach((l) => ws.addRow(l))

  const fina = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } }
  const bordas = { top: fina, left: fina, bottom: fina, right: fina }

  for (let r = 1; r <= linhas.length + 1; r++) {
    for (let c = 1; c <= colunas.length; c++) {
      const cel = ws.getCell(r, c)
      cel.border = bordas
      if (r === 1) {
        cel.font = { bold: true, color: { argb: 'FF1D3D26' } }
        cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
        cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
        continue
      }
      const tipo = colunas[c - 1].tipo
      cel.alignment = { vertical: 'middle', horizontal: HORIZONTAL[tipo], wrapText: tipo === 'texto' }
      const formato = FORMATO[tipo]
      if (formato) cel.numFmt = formato
    }
  }

  colunas.forEach((col, i) => {
    const palavras = col.titulo.split(' ')
    const titulo = Math.max(...palavras.map((p) => p.length), Math.ceil(col.titulo.length / 2)) + 3
    const conteudo = linhas.reduce((mx, l) => Math.max(mx, tamanho(l[i], col.tipo)), 0) + 2
    ws.getColumn(i + 1).width = Math.min(MAX[col.tipo], Math.max(MIN[col.tipo], titulo, conteudo))
  })

  ws.getRow(1).height = 34
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: linhas.length + 1, column: colunas.length },
  }
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '1:1',
  }

    return (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer
}

export function baixarArquivo(nome: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function baixarXlsx(
  arquivo: string,
  aba: string,
  colunas: Coluna[],
  linhas: Celula[][],
) {
  const buffer = await gerarXlsx(aba, colunas, linhas)
  baixarArquivo(
    arquivo,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
}