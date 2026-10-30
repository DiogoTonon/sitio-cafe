import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StatusBadge from '../componentes/StatusBadge'
import Pagamentos from '../componentes/Pagamentos'
import Anexos from '../componentes/Anexos'
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarPrecoUnitario,
  formatarQuantidade,
  lerQuantidade,
  lerValor,
  numeroBR,
} from '../lib/formatar'

type Unidade = { codigo: string; nome: string; simbolo: string }
type Categoria = { id: string; nome: string; ativa: boolean; unidade_codigo: string | null }
type Subcategoria = {
  id: string
  categoria_id: string
  nome: string
  ativa: boolean
  unidade_codigo: string | null
}
type Fornecedor = { id: string; nome: string; ativo: boolean }
type Conta = {
  id: string
  descricao: string
  categoria_id: string
  subcategoria_id: string | null
  fornecedor_id: string | null
  valor_original: number
  quantidade: number | null
  unidade_codigo: string | null
  preco_unitario: number | null
  data_lancamento: string
  data_emissao: string | null
  data_vencimento: string
  competencia: string | null
  forma_pagamento: string | null
  observacoes: string | null
  cancelada: boolean
  motivo_cancelamento: string | null
  cancelada_em: string | null
  total_pago: number
  saldo_principal: number
  status: string
  paga_com_atraso: boolean
  dias_atraso_pagamento: number | null
}

const FORMAS = ['Dinheiro', 'PIX', 'Boleto', 'Transferência', 'Cartão', 'Cheque', 'Outra']

function mensagemDeErro(e: { code?: string; message: string }) {
  if (e.code === 'P0001') return e.message
  if (e.code === '23514') return 'Algum campo está com valor inválido. Confira os valores e as datas.'
  return 'Não foi possível salvar. Verifique a internet e tente de novo.'
}

function irParaTopo() {
  window.scrollTo({ top: 0, behavior: 'auto' })
}

export default function DespesaForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const avisoInicial = (location.state as { aviso?: string } | null)?.aviso ?? ''

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [subs, setSubs] = useState<Subcategoria[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [conta, setConta] = useState<Conta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState(avisoInicial)
  const [salvando, setSalvando] = useState(false)

  const [descricao, setDescricao] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [subId, setSubId] = useState('')
  const [fornecedorId, setFornecedorId] = useState('')
  const [valorTexto, setValorTexto] = useState('')
  const [quantidadeTexto, setQuantidadeTexto] = useState('')
  const [vencimento, setVencimento] = useState('')
  const [emissao, setEmissao] = useState('')
  const [competencia, setCompetencia] = useState('')
  const [forma, setForma] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const [novoFornAberto, setNovoFornAberto] = useState(false)
  const [novoFornNome, setNovoFornNome] = useState('')
  const [novoFornErro, setNovoFornErro] = useState('')
  const [criandoForn, setCriandoForn] = useState(false)

  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(async () => {
    const [c, s, f, u] = await Promise.all([
      supabase.from('categorias').select('id, nome, ativa, unidade_codigo').order('nome'),
      supabase
        .from('subcategorias')
        .select('id, categoria_id, nome, ativa, unidade_codigo')
        .order('nome'),
      supabase.from('fornecedores').select('id, nome, ativo').order('nome'),
      supabase.from('unidades_medida').select('codigo, nome, simbolo'),
    ])
    if (c.error || s.error || f.error || u.error) {
      setErro('Não foi possível carregar os cadastros. Recarregue a página.')
      setCarregando(false)
      return
    }
    setCategorias(c.data)
    setSubs(s.data)
    setFornecedores(f.data)
    setUnidades(u.data)

    if (id) {
      const r = await supabase.from('v_contas_pagar').select('*').eq('id', id).maybeSingle()
      if (r.error || !r.data) {
        setErro('Não encontramos esta conta.')
      } else {
        const d: Conta = r.data
        setConta(d)
        setDescricao(d.descricao)
        setCategoriaId(d.categoria_id)
        setSubId(d.subcategoria_id ?? '')
        setFornecedorId(d.fornecedor_id ?? '')
        setValorTexto(numeroBR(d.valor_original))
        setQuantidadeTexto(d.quantidade !== null ? formatarQuantidade(d.quantidade) : '')
        setVencimento(d.data_vencimento)
        setEmissao(d.data_emissao ?? '')
        setCompetencia(d.competencia ? d.competencia.slice(0, 7) : '')
        setForma(d.forma_pagamento ?? '')
        setObservacoes(d.observacoes ?? '')
      }
    }
    setCarregando(false)
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Unidade de medida que vale para esta despesa:
  // 1) a que a própria conta já guardou (se a classificação não mudou);
  // 2) a da subcategoria; 3) a da categoria.
  const categoriaSel = categorias.find((c) => c.id === categoriaId)
  const subSel = subs.find((s) => s.id === subId)
  const mesmaClassificacao =
    conta !== null && conta.categoria_id === categoriaId && (conta.subcategoria_id ?? '') === subId
  const codigoUnidade =
    mesmaClassificacao && conta?.unidade_codigo
      ? conta.unidade_codigo
      : (subSel?.unidade_codigo ?? categoriaSel?.unidade_codigo ?? null)
  const unidade = unidades.find((u) => u.codigo === codigoUnidade) ?? null

  const valorNumero = lerValor(valorTexto)
  const quantidadeNumero = quantidadeTexto.trim() ? lerQuantidade(quantidadeTexto) : null
  const precoPrevia =
    valorNumero !== null && valorNumero > 0 && quantidadeNumero !== null && quantidadeNumero > 0
      ? Math.round((valorNumero / quantidadeNumero) * 10000) / 10000
      : null

  async function criarFornecedor() {
    setNovoFornErro('')
    const nome = novoFornNome.trim()
    if (!nome) {
      setNovoFornErro('Digite o nome do fornecedor.')
      return
    }
    setCriandoForn(true)
    const { data, error } = await supabase
      .from('fornecedores')
      .insert({ nome })
      .select('id, nome, ativo')
      .single()
    setCriandoForn(false)

    if (error) {
      setNovoFornErro(
        error.code === '23505'
          ? 'Já existe um fornecedor com esse nome. Escolha-o na lista acima.'
          : 'Não foi possível cadastrar. Verifique a internet e tente de novo.',
      )
      return
    }
    setFornecedores((lista) =>
      [...lista, data].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    )
    setFornecedorId(data.id)
    setNovoFornNome('')
    setNovoFornAberto(false)
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')

    const valor = lerValor(valorTexto)
    if (valor === null || valor <= 0) {
      setErro('Digite um valor maior que zero, por exemplo 1.250,00. Use vírgula para os centavos.')
      irParaTopo()
      return
    }

    let quantidade: number | null = null
    if (unidade && quantidadeTexto.trim() !== '') {
      quantidade = lerQuantidade(quantidadeTexto)
      if (quantidade === null || quantidade <= 0) {
        setErro(
          'A quantidade precisa ser um número maior que zero, por exemplo 212,5. Use vírgula para as casas decimais, ou deixe em branco.',
        )
        irParaTopo()
        return
      }
    }

    const dados = {
      descricao: descricao.trim(),
      categoria_id: categoriaId,
      subcategoria_id: subId || null,
      fornecedor_id: fornecedorId || null,
      valor_original: valor,
      quantidade,
      unidade_codigo: quantidade !== null && unidade ? unidade.codigo : null,
      data_emissao: emissao,
      data_vencimento: vencimento,
      competencia: competencia ? `${competencia}-01` : null,
      forma_pagamento: forma || null,
      observacoes: observacoes.trim() || null,
    }

    setSalvando(true)

    if (!id) {
      const { data, error } = await supabase.from('contas_pagar').insert(dados).select('id').single()
      setSalvando(false)
      if (error) {
        setErro(mensagemDeErro(error))
        irParaTopo()
        return
      }
      navigate(`/contas-pagar/${data.id}`, {
        state: { aviso: 'Despesa cadastrada. Ela já aparece na lista de contas a pagar.' },
      })
      return
    }

    const { data, error } = await supabase.from('contas_pagar').update(dados).eq('id', id).select('id')
    setSalvando(false)
    if (error) {
      setErro(mensagemDeErro(error))
      irParaTopo()
      return
    }
    if (!data || data.length === 0) {
      setErro('Não foi possível salvar as alterações.')
      irParaTopo()
      return
    }
    setAviso('Alterações salvas.')
    irParaTopo()
    carregar()
  }

  async function cancelarConta(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')
    setSalvando(true)
    const { data, error } = await supabase
      .from('contas_pagar')
      .update({ cancelada: true, motivo_cancelamento: motivo.trim() })
      .eq('id', id)
      .select('id')
    setSalvando(false)

    if (error) {
      setErro(mensagemDeErro(error))
      irParaTopo()
      return
    }
    if (!data || data.length === 0) {
      setErro('Não foi possível cancelar a conta.')
      irParaTopo()
      return
    }
    setCancelando(false)
    setMotivo('')
    setAviso('Conta cancelada. Ela fica guardada no histórico, mas não entra mais nos totais.')
    irParaTopo()
    carregar()
  }

  if (carregando) return <p>Carregando...</p>

  if (id && !conta) {
    return (
      <>
        <p className="erro" role="alert">
          {erro || 'Não encontramos esta conta.'}
        </p>
        <Link className="botao-texto" to="/contas-pagar">
          ← Voltar para contas a pagar
        </Link>
      </>
    )
  }

  const bloqueada = conta?.cancelada === true
  const categoriasLista = categorias.filter((c) => c.ativa || c.id === categoriaId)
  const subsLista = subs.filter((s) => s.categoria_id === categoriaId && (s.ativa || s.id === subId))
  const fornecedoresLista = fornecedores.filter((f) => f.ativo || f.id === fornecedorId)
  const simboloDaConta = unidades.find((u) => u.codigo === conta?.unidade_codigo)?.simbolo ?? ''

  return (
    <>
      <h1>{id ? 'Detalhes da despesa' : 'Nova despesa'}</h1>
      <Link className="botao-texto" to="/contas-pagar">
        ← Voltar para contas a pagar
      </Link>

      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="aviso" role="status">
          {aviso}
        </p>
      )}

      {conta && (
        <section className="bloco">
          <div className="resumo-topo">
            <StatusBadge
              status={conta.status}
              pagaComAtraso={conta.paga_com_atraso}
              dias={conta.dias_atraso_pagamento}
            />
          </div>
          <dl className="resumo">
            <div>
              <dt>Valor da conta</dt>
              <dd>{formatarMoeda(conta.valor_original)}</dd>
            </div>
            <div>
              <dt>Já pago</dt>
              <dd>{formatarMoeda(conta.total_pago)}</dd>
            </div>
            <div>
              <dt>Falta pagar</dt>
              <dd>{conta.cancelada ? '—' : formatarMoeda(conta.saldo_principal)}</dd>
            </div>
            <div>
              <dt>Vencimento</dt>
              <dd>{formatarData(conta.data_vencimento)}</dd>
            </div>
            <div>
              <dt>Emissão da nota</dt>
              <dd>{conta.data_emissao ? formatarData(conta.data_emissao) : '—'}</dd>
            </div>
            <div>
              <dt>Lançada no sistema em</dt>
              <dd>{formatarData(conta.data_lancamento)}</dd>
            </div>
            {conta.quantidade !== null && conta.preco_unitario !== null && (
              <>
                <div>
                  <dt>Quantidade</dt>
                  <dd>
                    {formatarQuantidade(conta.quantidade)} {simboloDaConta}
                  </dd>
                </div>
                <div>
                  <dt>Preço por {simboloDaConta}</dt>
                  <dd>{formatarPrecoUnitario(conta.preco_unitario)}</dd>
                </div>
              </>
            )}
          </dl>
          {conta.cancelada && (
            <p className="nota">
              Cancelada em {formatarDataHora(conta.cancelada_em)}. Motivo: {conta.motivo_cancelamento}
            </p>
          )}
        </section>
      )}

      {conta && (
        <Pagamentos
          contaId={conta.id}
          categoriaId={conta.categoria_id}
          saldoPrincipal={conta.saldo_principal}
          cancelada={conta.cancelada}
          aoMudar={carregar}
        />
      )}

      {conta && <Anexos contaId={conta.id} cancelada={conta.cancelada} />}

      <form className="bloco" onSubmit={salvar}>
        <fieldset className="sem-borda" disabled={bloqueada || salvando}>
          {bloqueada && (
            <p className="nota">Esta conta está cancelada e não pode mais ser alterada.</p>
          )}

          <div className="grade">
            <div className="campo largo">
              <label htmlFor="descricao">
                Descrição <span className="obrig">(obrigatório)</span>
              </label>
              <input
                id="descricao"
                type="text"
                required
                maxLength={200}
                placeholder="Ex.: Óleo diesel para o trator"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            <div className="campo">
              <label htmlFor="categoria">
                Categoria <span className="obrig">(obrigatório)</span>
              </label>
              <select
                id="categoria"
                required
                value={categoriaId}
                onChange={(e) => {
                  setCategoriaId(e.target.value)
                  setSubId('')
                }}
              >
                <option value="">Escolha a categoria...</option>
                {categoriasLista.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.ativa ? '' : ' (desativada)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="sub">Subcategoria</label>
              <select
                id="sub"
                value={subId}
                disabled={!categoriaId}
                onChange={(e) => setSubId(e.target.value)}
              >
                <option value="">Nenhuma</option>
                {subsLista.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                    {s.ativa ? '' : ' (desativada)'}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo largo">
              <label htmlFor="fornecedor">Fornecedor</label>
              <select
                id="fornecedor"
                value={fornecedorId}
                onChange={(e) => setFornecedorId(e.target.value)}
              >
                <option value="">Não informado</option>
                {fornecedoresLista.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                    {f.ativo ? '' : ' (desativado)'}
                  </option>
                ))}
              </select>

              {!bloqueada && !novoFornAberto && (
                <button
                  className="botao-texto"
                  type="button"
                  onClick={() => {
                    setNovoFornErro('')
                    setNovoFornAberto(true)
                  }}
                >
                  + Cadastrar novo fornecedor
                </button>
              )}

              {novoFornAberto && (
                <div className="novo-forn">
                  <label htmlFor="novo-forn-nome">Nome do novo fornecedor</label>
                  <input
                    id="novo-forn-nome"
                    type="text"
                    maxLength={150}
                    placeholder="Ex.: Agropecuária Santo Antônio"
                    value={novoFornNome}
                    onChange={(e) => setNovoFornNome(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        criarFornecedor()
                      }
                    }}
                  />
                  {novoFornErro && (
                    <p className="erro" role="alert">
                      {novoFornErro}
                    </p>
                  )}
                  <div className="linha">
                    <button
                      className="botao-pequeno"
                      type="button"
                      disabled={criandoForn}
                      onClick={criarFornecedor}
                    >
                      {criandoForn ? 'Cadastrando...' : 'Cadastrar fornecedor'}
                    </button>
                    <button
                      className="botao-pequeno secundario"
                      type="button"
                      onClick={() => {
                        setNovoFornAberto(false)
                        setNovoFornNome('')
                        setNovoFornErro('')
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                  <span className="dica">
                    Telefone e CPF/CNPJ podem ser preenchidos depois, em Cadastros &gt; Fornecedores.
                  </span>
                </div>
              )}
            </div>

            <div className="campo">
              <label htmlFor="valor">
                Valor da conta (R$) <span className="obrig">(obrigatório)</span>
              </label>
              <input
                id="valor"
                type="text"
                inputMode="decimal"
                required
                placeholder="Ex.: 1.250,00"
                value={valorTexto}
                onChange={(e) => setValorTexto(e.target.value)}
              />
              <span className="dica">Use vírgula para os centavos.</span>
            </div>

            {unidade && (
              <div className="campo">
                <label htmlFor="quantidade">Quantidade comprada ({unidade.simbolo})</label>
                <input
                  id="quantidade"
                  type="text"
                  inputMode="decimal"
                  placeholder={`Ex.: 200 (em ${unidade.nome.toLowerCase()})`}
                  value={quantidadeTexto}
                  onChange={(e) => setQuantidadeTexto(e.target.value)}
                />
                <span className="dica">
                  {precoPrevia !== null
                    ? `Preço por ${unidade.simbolo}: ${formatarPrecoUnitario(precoPrevia)} (valor da conta ÷ quantidade, sem juros e multa)`
                    : 'Opcional. Preenchendo, o sistema calcula o preço por unidade.'}
                </span>
              </div>
            )}

            <div className="campo">
              <label htmlFor="vencimento">
                Data de vencimento <span className="obrig">(obrigatório)</span>
              </label>
              <input
                id="vencimento"
                type="date"
                required
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
              />
            </div>

            <div className="campo">
              <label htmlFor="emissao">
                Data de emissão da nota <span className="obrig">(obrigatório)</span>
              </label>
              <input
                id="emissao"
                type="date"
                required
                value={emissao}
                onChange={(e) => setEmissao(e.target.value)}
              />
              <span className="dica">Data impressa na nota fiscal.</span>
            </div>

            <div className="campo">
              <label htmlFor="competencia">Mês de referência</label>
              <input
                id="competencia"
                type="month"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
              />
              <span className="dica">
                Mês a que a despesa pertence. Se deixar em branco, os relatórios usam o vencimento.
              </span>
            </div>

            <div className="campo">
              <label htmlFor="forma">Forma de pagamento prevista</label>
              <select id="forma" value={forma} onChange={(e) => setForma(e.target.value)}>
                <option value="">Não informada</option>
                {FORMAS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo largo">
              <label htmlFor="obs">Observações</label>
              <textarea
                id="obs"
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
              />
            </div>
          </div>

          {!bloqueada && (
            <button className="botao" type="submit">
              {salvando ? 'Salvando...' : id ? 'Salvar alterações' : 'Cadastrar despesa'}
            </button>
          )}
        </fieldset>
      </form>

      {conta && !bloqueada && (
        <section className="bloco">
          {!cancelando ? (
            <button className="botao-texto perigo" type="button" onClick={() => setCancelando(true)}>
              Cancelar esta conta
            </button>
          ) : (
            <form onSubmit={cancelarConta}>
              <label htmlFor="motivo">
                Por que esta conta será cancelada? <span className="obrig">(obrigatório)</span>
              </label>
              <textarea
                id="motivo"
                rows={2}
                required
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
              />
              <p className="nota">
                A conta não é apagada: ela fica guardada no histórico, mas sai dos totais. Contas que já
                tiveram pagamentos não podem ser canceladas.
              </p>
              <div className="linha">
                <button className="botao-pequeno" type="submit" disabled={salvando}>
                  Confirmar cancelamento
                </button>
                <button
                  className="botao-pequeno secundario"
                  type="button"
                  onClick={() => {
                    setCancelando(false)
                    setMotivo('')
                  }}
                >
                  Voltar
                </button>
              </div>
            </form>
          )}
        </section>
      )}
    </>
  )
}