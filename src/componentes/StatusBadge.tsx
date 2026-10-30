const classes: Record<string, string> = {
  Pendente: 'status-pendente',
  Atrasada: 'status-atrasada',
  Paga: 'status-paga',
  'Parcialmente paga': 'status-parcial',
  Cancelada: 'status-cancelada',
  Recebido: 'status-paga',
  'Parcialmente recebido': 'status-parcial',
  Cancelado: 'status-cancelada',
}

type Props = { status: string; pagaComAtraso?: boolean; dias?: number | null }

export default function StatusBadge({ status, pagaComAtraso = false, dias = null }: Props) {
  if (status === 'Paga' && pagaComAtraso) {
    const texto = dias && dias > 0 ? ` · ${dias} ${dias === 1 ? 'dia' : 'dias'}` : ''
    return <span className="status status-paga-atraso">Paga com atraso{texto}</span>
  }
  return (
    <span className={`status ${classes[status] ?? 'status-cancelada'}`}>
      {status === 'Atrasada' ? '⚠ ' : ''}
      {status}
    </span>
  )
}