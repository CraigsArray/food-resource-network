import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [done, setDone]           = useState(false)

  async function handleSubmit(e) {
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
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (updateError) {
      setError(updateError.message)
    } else {
      setDone(true)
      setTimeout(() => navigate('/login'), 2500)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem', background: 'var(--color-bg-dark)' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

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
        </div>

        <div style={{ background: 'var(--color-bg-medium)', border: '1px solid var(--color-border)', borderRadius: 20, padding: '2rem', boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>Password updated</h2>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Redirecting you to sign in…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '0.2rem' }}>Set new password</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Choose a strong password for your account.</p>
              </div>

              <div>
                <label style={labelStyle}>New password</label>
                <input className="form-input" type="password" required autoFocus placeholder="Min. 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
              </div>

              <div>
                <label style={labelStyle}>Confirm new password</label>
                <input className="form-input" type="password" required placeholder="Re-enter password" value={confirm} onChange={e => setConfirm(e.target.value)} />
              </div>

              {error && <p style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{error}</p>}

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
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }
