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

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status ${classes[status] ?? 'status-cancelada'}`}>
      {status === 'Atrasada' ? '⚠ ' : ''}
      {status}
    </span>
  )
}