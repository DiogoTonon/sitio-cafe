import { NavLink, Outlet } from 'react-router-dom'

const abas = [
  { para: '/relatorios', texto: 'Fluxo de caixa', fim: true },
  { para: '/relatorios/lancamentos', texto: 'Receitas e despesas lançadas', fim: false },
  { para: '/relatorios/comparacao', texto: 'Comparação entre anos', fim: false },
  { para: '/relatorios/mensal', texto: 'Mês a mês e fornecedores', fim: false },
  { para: '/relatorios/categorias', texto: 'Por categoria', fim: false },
]

export default function RelatoriosLayout() {
    return (
    <>
      <div className="so-impressao" style={{ marginBottom: 12, borderBottom: '2px solid #2f5d3a', paddingBottom: 6 }}>
        <strong style={{ fontSize: 16 }}>Sítio – Relatório financeiro</strong>
        <div style={{ fontSize: 11 }}>
          Gerado em {new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        </div>
      </div>
      <h1>Relatórios anuais</h1>
      <nav className="abas" aria-label="Tipos de relatório">
        {abas.map((a) => (
          <NavLink
            key={a.para}
            to={a.para}
            end={a.fim}
            className={({ isActive }) => (isActive ? 'aba ativa' : 'aba')}
          >
            {a.texto}
          </NavLink>
        ))}
        <button type="button" className="nao-imprimir" onClick={() => window.print()}>
          Salvar em PDF / Imprimir
        </button>
      </nav>
      <Outlet />
    </>
  )   
   }