import { NavLink, Outlet } from 'react-router-dom'

export default function Cadastros() {
  return (
    <>
      <h1>Cadastros</h1>
      <nav className="abas" aria-label="Tipos de cadastro">
        <NavLink
          to="/cadastros/categorias"
          className={({ isActive }) => (isActive ? 'aba ativa' : 'aba')}
        >
          Categorias
        </NavLink>
        <NavLink
          to="/cadastros/fornecedores"
          className={({ isActive }) => (isActive ? 'aba ativa' : 'aba')}
        >
          Fornecedores
        </NavLink>
      </nav>
      <Outlet />
    </>
  )
}