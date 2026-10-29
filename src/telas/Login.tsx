import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)

  async function entrar(evento: FormEvent) {
    evento.preventDefault()
    setErro('')
    setAviso('')
    setOcupado(true)

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    })

    setOcupado(false)

    if (error) {
      setErro(
        error.status === 400
          ? 'E-mail ou senha incorretos. Confira e tente de novo.'
          : 'Não foi possível entrar agora. Verifique a internet e tente de novo.',
      )
    }
  }

  async function esqueciSenha() {
    setErro('')
    setAviso('')

    if (!email.trim()) {
      setErro('Digite o seu e-mail no campo acima e clique de novo em "Esqueci minha senha".')
      return
    }

    setOcupado(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    })
    setOcupado(false)

    if (error) {
      setErro('Não foi possível enviar o e-mail agora. Espere alguns minutos e tente de novo.')
      return
    }
    setAviso(
      'Se esse e-mail tiver cadastro, enviamos um link para criar uma nova senha. Olhe também a caixa de spam.',
    )
  }

  return (
    <main className="centro">
      <form className="cartao" onSubmit={entrar}>
        <h1>Entrar no sistema</h1>

        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="senha">Senha</label>
        <input
          id="senha"
          type={mostrarSenha ? 'text' : 'password'}
          autoComplete="current-password"
          required
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />

        <label className="opcao">
          <input
            type="checkbox"
            checked={mostrarSenha}
            onChange={(e) => setMostrarSenha(e.target.checked)}
          />
          Mostrar a senha
        </label>

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

        <button className="botao" type="submit" disabled={ocupado}>
          {ocupado ? 'Aguarde...' : 'Entrar'}
        </button>

        <button className="link" type="button" onClick={esqueciSenha} disabled={ocupado}>
          Esqueci minha senha
        </button>
      </form>
    </main>
  )
}