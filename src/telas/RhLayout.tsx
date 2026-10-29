import { NavLink, Outlet } from 'react-router-dom'

export default function RhLayout() {
  return (
    <>
      <h1>Funcionários</h1>
      <nav className="abas" aria-label="Seções de funcionários">
        <NavLink
          to="/funcionarios"
          end
          className={({ isActive }) => (isActive ? 'aba ativa' : 'aba')}
        >
          Pessoas
        </NavLink>
        <NavLink
          to="/funcionarios/folha"
          className={({ isActive }) => (isActive ? 'aba ativa' : 'aba')}
        >
          Folha mensal
        </NavLink>
        <NavLink
          to="/funcionarios/temporarios"
          className={({ isActive }) => (isActive ? 'aba ativa' : 'aba')}
        >
          Temporários
        </NavLink>
      </nav>
      <Outlet />
    </>
  )
}