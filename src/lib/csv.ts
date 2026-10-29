export function csvTexto(v: string): string {
  return /^[=+\-@]/.test(v) ? `'${v}` : v
}

export function csvData(v: string): string {
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export const csvNumero = (v: number, casas: number) => v.toFixed(casas).replace('.', ',')
export const csvQuantidade = (v: number) => String(v).replace('.', ',')

function escapar(c: string): string {
  return /[";\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c
}

export function montarCsv(cabecalho: string[], linhas: string[][]): string {
  return '\uFEFF' + [cabecalho, ...linhas].map((l) => l.map(escapar).join(';')).join('\r\n')
}

export function baixarCsv(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}