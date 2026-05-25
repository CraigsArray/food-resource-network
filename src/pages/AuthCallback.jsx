import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function AuthCallback() {
  const navigate  = useNavigate()
  const calledRef = useRef(false)   // prevent double-invoke in React StrictMode

  useEffect(() => {
    if (calledRef.current) return
    calledRef.current = true

    async function run() {
      // Supabase JS automatically exchanges the PKCE code / hash fragment
      // when detectSessionInUrl is true (the default). We wait for the session
      // to materialise via onAuthStateChange, then call the RPC.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          subscription.unsubscribe()
          navigate('/reset-password')
          return
        }

        if (event !== 'SIGNED_IN' || !session) return

        subscription.unsubscribe()

        const { data, error } = await supabase.rpc('handle_auth_callback')

        if (error) {
          console.error('handle_auth_callback RPC failed:', error)
          navigate('/organization-request')
          return
        }

        navigate(data?.redirect ?? '/organization-request')
      })

      // Fallback: if the session is already active (e.g. user revisits /auth/callback)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        subscription.unsubscribe()
        const { data, error } = await supabase.rpc('handle_auth_callback')
        if (error) {
          console.error('handle_auth_callback RPC failed:', error)
          navigate('/organization-request')
          return
        }
        navigate(data?.redirect ?? '/organization-request')
      }
    }

    run()
  }, [navigate])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        border: '3px solid var(--color-border)',
        borderTopColor: 'var(--color-primary)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: 'var(--color-text-muted)' }}>Signing you in…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
