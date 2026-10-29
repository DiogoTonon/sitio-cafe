import { NavLink, Outlet } from 'react-router-dom'

export default function HistoricoLayout() {
  return (
    <>
      <h1>Histórico e documentos</h1>
      <nav className="abas" aria-label="Seções do histórico">
        <NavLink to="/historico" end className={({ isActive }) => (isActive ? 'aba ativa' : 'aba')}>
          Documentos
        </NavLink>
        <NavLink
          to="/historico/exportar"
          className={({ isActive }) => (isActive ? 'aba ativa' : 'aba')}
        >
          Exportar e backup
        </NavLink>
      </nav>
      <Outlet />
    </>
  )
}