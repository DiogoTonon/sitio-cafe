import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useSessao() {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [recuperando, setRecuperando] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session)
      setCarregando(false)
    })

    const { data: inscricao } = supabase.auth.onAuthStateChange((evento, nova) => {
      setSessao(nova)
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
    })

    return () => inscricao.subscription.unsubscribe()
  }, [])

  return {
    sessao,
    carregando,
    recuperando,
    finalizarRecuperacao: () => setRecuperando(false),
  }
}