import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const itens = [
  { para: '/', texto: 'Início', fim: true },
  { para: '/contas-pagar', texto: 'Contas a pagar', fim: false },
  { para: '/contas-receber', texto: 'Contas a receber', fim: false },
  { para: '/funcionarios', texto: 'Funcionários', fim: false },
  { para: '/relatorios', texto: 'Relatórios anuais', fim: false },
  { para: '/cadastros', texto: 'Cadastros', fim: false },
  { para: '/historico', texto: 'Histórico e documentos', fim: false },
]

export default function Layout({ email }: { email: string }) {
  const [aberto, setAberto] = useState(false)
  const { pathname } = useLocation()

  const atual = itens.find((i) =>
    i.para === '/' ? pathname === '/' : pathname.startsWith(i.para),
  )

  return (
    <div>
      <header className="topo">
        <div className="topo-linha">
          <strong>Gestão do Sítio</strong>
          <button className="botao-sair" onClick={() => supabase.auth.signOut()}>
            Sair
          </button>
          <span className="usuario">{email}</span>
        </div>

        <button
          className="botao-menu"
          type="button"
          aria-expanded={aberto}
          aria-controls="menu-principal"
          onClick={() => setAberto(!aberto)}
        >
          <span>Menu</span>
          {atual && <span className="menu-atual">{atual.texto}</span>}
        </button>

        <nav
          id="menu-principal"
          className={aberto ? 'menu aberto' : 'menu'}
          aria-label="Menu principal"
        >
          {itens.map((item) => (
            <NavLink
              key={item.para}
              to={item.para}
              end={item.fim}
              className={({ isActive }) => (isActive ? 'item ativo' : 'item')}
              onClick={() => setAberto(false)}
            >
              {item.texto}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="pagina">
        <Outlet />
      </main>
    </div>
  )
}