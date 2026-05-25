import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { session } = useAuth()
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  if (session) return <Navigate to="/admin" replace />

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setLoading(false)
    if (authError) setError(authError.message)
    else setSent(true)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem', background: 'var(--color-bg-dark)' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo / branding */}
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
            Provider portal sign-in
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'var(--color-bg-medium)',
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          padding: '2rem',
          boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
        }}>
          {sent ? (
            <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
              <div style={{ fontSize: '2.75rem', marginBottom: '1.25rem' }}>📬</div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.6rem', color: 'var(--color-text-primary)' }}>
                Check your email
              </h2>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
                We sent a magic link to{' '}
                <strong style={{ color: 'var(--color-primary)' }}>{email}</strong>.<br />
                Click the link to sign in — no password needed.
              </p>
              <button
                className="btn-secondary"
                style={{ marginTop: '1.75rem', width: '100%', justifyContent: 'center' }}
                onClick={() => { setSent(false); setEmail('') }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.2rem' }}>
                  Sign in with magic link
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                  No password required — we'll email you a one-time link.
                </p>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>
                  Email address
                </label>
                <input
                  className="form-input"
                  type="email"
                  required
                  placeholder="you@organization.org"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                />
              </div>

              {error && (
                <p style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.85rem',
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                  border: 'none',
                  borderRadius: 12,
                  color: '#1a0a00',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  boxShadow: '0 4px 16px rgba(255,111,35,0.3)',
                  transition: 'all 200ms ease',
                }}
              >
                {loading ? 'Sending…' : 'Send Magic Link'}
              </button>

              <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.6, paddingTop: '0.25rem' }}>
                If your organization's domain is verified you'll go straight to the admin dashboard.
                Otherwise you'll be guided through a quick approval request.
              </p>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.75rem', fontSize: '0.85rem' }}>
          <a href="/" style={{ color: 'var(--color-text-muted)', textDecoration: 'none', fontWeight: 500 }}>
            ← Back to public feed
          </a>
        </p>
      </div>
    </div>
  )
}
