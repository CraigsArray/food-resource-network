import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

// Orgs that support Magic Sign On by email domain
const MAGIC_SSO_ORGS = [
  { name: 'San Diego Food Bank', domain: 'sandiegofoodbank.org' },
  { name: 'Feeding San Diego',   domain: 'feedingsandiego.org'  },
]

// Network super-admin emails that have access to view and edit all posts
const ADMIN_MAGIC_EMAILS = [
  'clewis1337@gmail.com',
]

// mode: 'signin' | 'signup' | 'forgot'
export default function LoginPage() {
  const { session } = useAuth()

  // --- Provider sign-in state ---
  const [mode, setMode]         = useState('signin')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [notice, setNotice]     = useState('')

  // --- Magic Sign On state ---
  const [magicEmail, setMagicEmail]   = useState('')
  const [magicLoading, setMagicLoading] = useState(false)
  const [magicError, setMagicError]   = useState('')
  const [magicSent, setMagicSent]     = useState(false)

  if (session) return <Navigate to="/admin" replace />

  function reset(nextMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
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

  async function handleMagicSignOn(e) {
    e.preventDefault()
    setMagicError('')
    setMagicSent(false)

    const normalised = magicEmail.trim().toLowerCase()
    const domain = normalised.split('@')[1] ?? ''
    const matched = MAGIC_SSO_ORGS.find(o => o.domain === domain)
    const isAdmin = ADMIN_MAGIC_EMAILS.includes(normalised)

    if (!matched && !isAdmin) {
      setMagicError(
        `Only @${MAGIC_SSO_ORGS.map(o => o.domain).join(' or @')} addresses (or authorized network admins) are eligible for Magic Sign On.`
      )
      return
    }

    setMagicLoading(true)
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: normalised,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setMagicLoading(false)

    if (otpError) {
      setMagicError(otpError.message)
    } else {
      setMagicSent(true)
    }
  }

  const titles = {
    signin: 'Sign in',
    signup: 'Create account',
    forgot: 'Reset password',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1.5rem',
      background: 'var(--color-bg-dark)',
    }}>
      <div style={{ width: '100%', maxWidth: 900 }}>

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

        {/* Two-column card row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '1.5rem',
          alignItems: 'start',
        }}>

          {/* ── Left: Provider sign-in ── */}
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

              {error  && <p style={{ color: 'var(--color-error)',   fontSize: '0.85rem' }}>{error}</p>}
              {notice && <p style={{ color: 'var(--color-success)', fontSize: '0.85rem', fontWeight: 600 }}>{notice}</p>}

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

          {/* ── Right: Magic Sign On ── */}
          <div style={{
            background: 'var(--color-bg-medium)',
            border: '1px solid hsla(210,90%,55%,0.35)',
            borderRadius: 20,
            padding: '2rem',
            boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1.25rem' }}>✨</span>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                Magic Sign On
              </h2>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginBottom: '0.6rem', lineHeight: 1.6 }}>
              For <strong style={{ color: 'var(--color-text-primary)' }}>San Diego Food Bank</strong> and{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>Feeding San Diego</strong>
            </p>

            {/* Org access explanation */}
            <div style={{
              fontSize: '0.8rem',
              color: 'var(--color-text-secondary)',
              background: 'hsla(210,90%,55%,0.06)',
              border: '1px solid hsla(210,90%,55%,0.18)',
              borderRadius: 10,
              padding: '0.75rem 0.9rem',
              marginBottom: '1.25rem',
              lineHeight: 1.65,
            }}>
              Staff and administrators can sign in directly to manage listings:
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.1rem' }}>
                {MAGIC_SSO_ORGS.map(org => (
                  <li key={org.domain}>
                    <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>@{org.domain}</span>
                    {' '}→ {org.name}
                  </li>
                ))}
                <li>
                  <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>clewis1337@gmail.com</span>
                  {' '}→ Network Admin (All Posts)
                </li>
              </ul>
            </div>

            {magicSent ? (
              <div style={{
                textAlign: 'center',
                padding: '1.5rem 1rem',
                background: 'hsla(140,60%,50%,0.07)',
                border: '1px solid hsla(140,60%,50%,0.25)',
                borderRadius: 12,
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📬</div>
                <p style={{ fontWeight: 700, color: 'var(--color-text-primary)', margin: '0 0 0.3rem' }}>Check your inbox</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }}>
                  A sign-in link has been sent to <strong>{magicEmail}</strong>. Click it to access the dashboard — no password needed.
                </p>
                <button
                  type="button"
                  onClick={() => { setMagicSent(false); setMagicEmail('') }}
                  style={{ ...linkBtnStyle, marginTop: '1rem', fontSize: '0.8rem' }}
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <form onSubmit={handleMagicSignOn} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Work email address</label>
                  <input
                    className="form-input"
                    type="email"
                    required
                    placeholder="you@sandiegofoodbank.org"
                    value={magicEmail}
                    onChange={e => { setMagicEmail(e.target.value); setMagicError('') }}
                  />
                </div>

                {magicError && <p style={{ color: 'var(--color-error)', fontSize: '0.82rem', margin: 0 }}>{magicError}</p>}

                <button
                  type="submit"
                  disabled={magicLoading}
                  style={{
                    width: '100%', padding: '0.85rem',
                    background: 'linear-gradient(135deg, #2563eb, #3b82f6)',
                    border: 'none', borderRadius: 12,
                    color: '#fff', fontWeight: 800, fontSize: '0.95rem',
                    letterSpacing: '0.4px', textTransform: 'uppercase',
                    cursor: magicLoading ? 'not-allowed' : 'pointer',
                    opacity: magicLoading ? 0.6 : 1,
                    boxShadow: '0 4px 16px rgba(37,99,235,0.3)',
                    transition: 'all 200ms ease',
                  }}
                >
                  {magicLoading ? 'Sending…' : 'Send Magic Link'}
                </button>

                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', textAlign: 'center', margin: 0, lineHeight: 1.5 }}>
                  We'll email you a one-time sign-in link. No password required.
                </p>
              </form>
            )}
          </div>

        </div>{/* end two-column grid */}

        <p style={{ textAlign: 'center', marginTop: '1.75rem', fontSize: '0.85rem' }}>
          <a href="/" style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontWeight: 500 }}>← Back to public feed</a>
        </p>
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }

const linkBtnStyle = { background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: 'inherit' }
