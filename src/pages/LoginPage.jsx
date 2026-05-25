import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

// mode: 'signin' | 'signup' | 'forgot'
export default function LoginPage() {
  const { session } = useAuth()
  const [mode, setMode]       = useState('signin')
  const [email, setEmail]     = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  if (session) return <Navigate to="/admin" replace />

  function reset(nextMode) {
    setMode(nextMode)
    setError('')
    setPassword('')
    setConfirm('')
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Profile + org matching happens server-side
    const { data, error: rpcError } = await supabase.rpc('handle_auth_callback')
    setLoading(false)

    if (rpcError) {
      setError('Signed in, but failed to load your organization. Try refreshing.')
      return
    }

    window.location.href = data?.redirect ?? '/organization-request'
  }

  async function handleSignUp(e) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    const { data, error: rpcError } = await supabase.rpc('handle_auth_callback')
    setLoading(false)

    if (rpcError) {
      setError('Account created, but failed to load your organization. Try signing in.')
      return
    }

    window.location.href = data?.redirect ?? '/organization-request'
  }

  async function handleForgot(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: `${window.location.origin}/auth/callback` }
    )
    setLoading(false)

    if (authError) {
      setError(authError.message)
    } else {
      setNotice(`Password reset email sent to ${email}.`)
    }
  }

  const titles = {
    signin: 'Sign in',
    signup: 'Create account',
    forgot: 'Reset password',
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem', background: 'var(--color-bg-dark)' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 72, height: 72, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
            fontSize: '2rem', marginBottom: '1.25rem',
            boxShadow: '0 6px 24px rgba(255,111,35,0.3)',
          }}>🥗</div>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.85rem', fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.3px' }}>
            East County Food Network
          </h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '0.4rem', fontSize: '0.9rem' }}>
            Provider portal
          </p>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--color-bg-medium)', border: '1px solid var(--color-border)', borderRadius: 20, padding: '2rem', boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>

          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '1.5rem' }}>
            {titles[mode]}
          </h2>

          <form
              onSubmit={mode === 'signin' ? handleSignIn : mode === 'signup' ? handleSignUp : handleForgot}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              {/* Email */}
              <div>
                <label style={labelStyle}>Email address</label>
                <input className="form-input" type="email" required autoFocus placeholder="you@organization.org" value={email} onChange={e => setEmail(e.target.value)} />
              </div>

              {/* Password fields — not shown for forgot */}
              {mode !== 'forgot' && (
                <div>
                  <label style={labelStyle}>Password</label>
                  <input className="form-input" type="password" required placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'} value={password} onChange={e => setPassword(e.target.value)} />
                </div>
              )}

              {mode === 'signup' && (
                <div>
                  <label style={labelStyle}>Confirm password</label>
                  <input className="form-input" type="password" required placeholder="Re-enter password" value={confirm} onChange={e => setConfirm(e.target.value)} />
                </div>
              )}

              {error && <p style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{error}</p>}

              {/* Forgot password link — only in signin mode */}
              {mode === 'signin' && (
                <div style={{ textAlign: 'right', marginTop: '-0.25rem' }}>
                  <button type="button" onClick={() => reset('forgot')} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}>
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%', padding: '0.85rem', marginTop: '0.25rem',
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                  border: 'none', borderRadius: 12,
                  color: '#1a0a00', fontWeight: 800, fontSize: '0.95rem',
                  letterSpacing: '0.4px', textTransform: 'uppercase',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  boxShadow: '0 4px 16px rgba(255,111,35,0.3)',
                  transition: 'all 200ms ease',
                }}
              >
                {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
              </button>

              {/* Mode toggles */}
              <div style={{ textAlign: 'center', fontSize: '0.82rem', color: 'var(--color-text-muted)', paddingTop: '0.25rem' }}>
                {mode === 'signin' && (
                  <>Don't have an account?{' '}
                    <button type="button" onClick={() => reset('signup')} style={linkBtnStyle}>Create one</button>
                  </>
                )}
                {mode === 'signup' && (
                  <>Already have an account?{' '}
                    <button type="button" onClick={() => reset('signin')} style={linkBtnStyle}>Sign in</button>
                  </>
                )}
                {mode === 'forgot' && (
                  <button type="button" onClick={() => reset('signin')} style={linkBtnStyle}>← Back to sign in</button>
                )}
              </div>
            </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.75rem', fontSize: '0.85rem' }}>
          <a href="/" style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontWeight: 500 }}>← Back to public feed</a>
        </p>
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }

const linkBtnStyle = { background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 'inherit' }
