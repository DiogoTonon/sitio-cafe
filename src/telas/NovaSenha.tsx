import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function NovaSenha({ aoConcluir }: { aoConcluir: () => void }) {
  const [senha, setSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [mostrar, setMostrar] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')

    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (senha !== confirmacao) {
      setErro('As duas senhas não são iguais. Digite de novo.')
      return
    }

    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)

    if (error) {
      setErro('Não foi possível salvar a nova senha. Peça um novo link e tente de novo.')
      return
    }
    aoConcluir()
  }

  return (
    <main className="centro">
      <form className="cartao" onSubmit={salvar}>
        <h1>Escolha a nova senha</h1>

        <label htmlFor="nova">Nova senha (mínimo 8 caracteres)</label>
        <input
          id="nova"
          type={mostrar ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />

        <label htmlFor="conf">Repita a nova senha</label>
        <input
          id="conf"
          type={mostrar ? 'text' : 'password'}
          autoComplete="new-password"
          required
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />

        <label className="opcao">
          <input
            type="checkbox"
            checked={mostrar}
            onChange={(e) => setMostrar(e.target.checked)}
          />
          Mostrar a senha
        </label>

        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}

        <button className="botao" type="submit" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar nova senha'}
        </button>
      </form>
    </main>
  )
}