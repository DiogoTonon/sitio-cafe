const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatarMoeda(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  return moeda.format(Number(valor)).replace(/\u00a0/g, ' ')
}

export function formatarData(data: string | null | undefined): string {
  if (!data) return '—'
  const [ano, mes, dia] = data.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

export function hojeISO(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

export function lerValor(texto: string): number | null {
  let t = texto.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '')
  if (t === '') return null
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '')
  }
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  return Number(t)
}

export function numeroBR(valor: number | string): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor))
}

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(',', '')
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
} 

export function lerQuantidade(texto: string): number | null {
  let t = texto.trim().replace(/\s/g, '')
  if (t === '') return null
  if (t.includes(',')) {
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '')
  }
  if (!/^\d+(\.\d{1,3})?$/.test(t)) return null
  return Number(t)
}

export function formatarQuantidade(valor: number | string): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(Number(valor))
}

export function formatarPrecoUnitario(valor: number | string): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
    .format(Number(valor))
    .replace(/\u00a0/g, ' ')
}

export function formatarMes(data: string | null | undefined): string {
  if (!data) return '—'
  const [ano, mes] = data.slice(0, 7).split('-')
  return `${mes}/${ano}`
}

export function vencimentoDaFolha(mesRef: string, dia: number, mesSeguinte: boolean): string {
  let [ano, mes] = mesRef.split('-').map(Number)
  if (mesSeguinte) {
    mes += 1
    if (mes > 12) {
      mes = 1
      ano += 1
    }
  }
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const d = Math.min(dia, ultimo)
  return `${ano}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}