import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useSessao } from './hooks/useSessao'
import Layout from './componentes/Layout'
import Login from './telas/Login'
import NovaSenha from './telas/NovaSenha'
import Inicio from './telas/Inicio'
import Cadastros from './telas/Cadastros'
import Categorias from './telas/Categorias'
import Fornecedores from './telas/Fornecedores'
import ContasPagar from './telas/ContasPagar'
import DespesaForm from './telas/DespesaForm'
import ContasReceber from './telas/ContasReceber'
import ReceitaForm from './telas/ReceitaForm'
import RhLayout from './telas/RhLayout'
import Pessoas from './telas/Pessoas'
import FolhaMensal from './telas/FolhaMensal'
import FolhaForm from './telas/FolhaForm'
import Historico from './telas/Historico'
import ServicosTemp from './telas/ServicosTemp'
import ServicoForm from './telas/ServicoForm'
import RelatoriosLayout from './telas/RelatoriosLayout'
import FluxoCaixa from './telas/FluxoCaixa'
import Lancamentos from './telas/Lancamentos'
import Comparacao from './telas/Comparacao'
import MesAMes from './telas/MesAMes'
import HistoricoLayout from './telas/HistoricoLayout'
import Exportar from './telas/Exportar'

export default function App() {
  const { sessao, carregando, recuperando, finalizarRecuperacao } = useSessao()

  if (carregando) {
    return <p className="centro">Carregando...</p>
  }

  if (!sessao) {
    return <Login />
  }

  if (recuperando) {
    return <NovaSenha aoConcluir={finalizarRecuperacao} />
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout email={sessao.user.email ?? ''} />}>
          <Route index element={<Inicio />} />
          <Route path="contas-pagar" element={<ContasPagar />} />
          <Route path="contas-pagar/nova" element={<DespesaForm key="nova" />} />
          <Route path="contas-pagar/:id" element={<DespesaForm key="editar" />} />
          <Route path="contas-receber" element={<ContasReceber />} />
          <Route path="contas-receber/nova" element={<ReceitaForm key="nova" />} />
          <Route path="contas-receber/:id" element={<ReceitaForm key="editar" />} />
          <Route path="funcionarios" element={<RhLayout />}>
            <Route index element={<Pessoas />} />
            <Route path="folha" element={<FolhaMensal />} />
            <Route path="folha/nova" element={<FolhaForm key="nova" />} />
            <Route path="folha/:id" element={<FolhaForm key="editar" />} />
            <Route path="temporarios" element={<ServicosTemp />} />
            <Route path="temporarios/novo" element={<ServicoForm key="novo" />} />
            <Route path="temporarios/:id" element={<ServicoForm key="editar" />} />
        </Route>
          <Route path="relatorios" element={<RelatoriosLayout />}>
          <Route index element={<FluxoCaixa />} />
          <Route path="lancamentos" element={<Lancamentos />} />
          <Route path="comparacao" element={<Comparacao />} />
          <Route path="mensal" element={<MesAMes />} />
        </Route>
          <Route path="cadastros" element={<Cadastros />}>
            <Route index element={<Navigate to="categorias" replace />} />
            <Route path="categorias" element={<Categorias />} />
            <Route path="fornecedores" element={<Fornecedores />} />
          </Route>
          <Route path="categorias" element={<Navigate to="/cadastros/categorias" replace />} />
          <Route path="historico" element={<HistoricoLayout />}>
          <Route index element={<Historico />} />
          <Route path="exportar" element={<Exportar />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}