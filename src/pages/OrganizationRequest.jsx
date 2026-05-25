import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

export default function OrganizationRequest() {
  const { user, session, memberships } = useAuth()
  const navigate = useNavigate()

  const [existing, setExisting] = useState(null)
  const [form, setForm]   = useState({ requested_name: '', website: '', phone: '', notes: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (memberships.length > 0) navigate('/admin', { replace: true })
  }, [memberships, navigate])

  useEffect(() => {
    if (!user) return
    supabase
      .from('pending_organizations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setExisting(data)
        if (data) setForm({ requested_name: data.requested_name ?? '', website: data.website ?? '', phone: data.phone ?? '', notes: data.notes ?? '' })
        setLoading(false)
      })
  }, [user])

  if (!session) { navigate('/login'); return null }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    const { error: err } = await supabase
      .from('pending_organizations')
      .update({ requested_name: form.requested_name, website: form.website, phone: form.phone, notes: form.notes })
      .eq('id', existing?.id)
      .eq('user_id', user.id)
    setSaving(false)
    if (err) setError(err.message)
    else setSuccess(true)
  }

  const domain = user?.email?.split('@')[1] ?? 'your domain'

  const statusColors = {
    pending:  { border: 'hsl(45,100%,51%)',  bg: 'hsla(45,100%,51%,0.08)' },
    approved: { border: 'var(--color-success)', bg: 'hsla(142,71%,45%,0.08)' },
    rejected: { border: 'var(--color-error)',   bg: 'hsla(0,84%,60%,0.08)' },
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-dark)' }}>
      <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-dark)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, hsl(220,50%,35%), hsl(260,50%,40%))',
          borderRadius: 20, padding: '1.75rem 2rem',
          boxShadow: '0 6px 24px rgba(0,0,0,0.2)',
        }}>
          <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(1.4rem, 4vw, 1.9rem)', fontWeight: 800, color: 'white', marginBottom: '0.3rem' }}>
            Access Request
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>
            Signed in as <strong style={{ color: 'white' }}>{user?.email}</strong>
          </p>
        </div>

        {/* Status banner */}
        {existing && (
          <div style={{
            borderRadius: 14, padding: '1.25rem 1.5rem',
            background: statusColors[existing.status]?.bg ?? 'var(--color-bg-medium)',
            border: `1px solid ${statusColors[existing.status]?.border ?? 'var(--color-border)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>Request status:</span>
              <span className={`status-badge status-${existing.status}`}>{existing.status}</span>
            </div>
            {existing.status === 'pending' && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                Your request is under review. You can update your organization details below while you wait.
              </p>
            )}
            {existing.status === 'approved' && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                Approved! <a href="/admin" style={{ color: 'var(--color-success)', fontWeight: 600 }}>Go to dashboard →</a>
              </p>
            )}
            {existing.status === 'rejected' && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                Your request was not approved. Contact us if you believe this is a mistake.
              </p>
            )}
          </div>
        )}

        {!existing && (
          <div style={{ borderRadius: 14, padding: '1.25rem 1.5rem', background: 'var(--color-bg-medium)', border: '1px solid var(--color-border)' }}>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, fontSize: '0.9rem' }}>
              Your email domain <strong style={{ color: 'var(--color-primary)' }}>@{domain}</strong> doesn't match
              a verified provider. Fill in your organization's details below and submit for review.
            </p>
          </div>
        )}

        {/* Form */}
        {existing?.status !== 'rejected' && (
          <div style={{ background: 'var(--color-bg-medium)', border: '1px solid var(--color-border)', borderRadius: 20, padding: '1.75rem 2rem' }}>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '1.5rem' }}>
              {existing ? 'Update organization details' : 'Organization information'}
            </h2>

            {success && (
              <div style={{ background: 'hsla(142,60%,45%,0.1)', border: '1px solid hsla(142,60%,45%,0.3)', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
                <p style={{ color: 'var(--color-success)', fontSize: '0.875rem', fontWeight: 600 }}>✓ Details saved successfully.</p>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.125rem' }}>
              <div>
                <label style={labelStyle}>Organization name <span style={{ color: 'var(--color-error)' }}>*</span></label>
                <input className="form-input" required value={form.requested_name} onChange={e => setForm(f => ({ ...f, requested_name: e.target.value }))} placeholder="e.g. San Diego Food Bank" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={labelStyle}>Website</label>
                  <input className="form-input" type="url" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input className="form-input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(619) 555-0100" />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Additional notes</label>
                <textarea className="form-input" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Anything else we should know about your organization's food access work…" style={{ resize: 'vertical' }} />
              </div>

              {error && <p style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{error}</p>}

              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    flex: 1, padding: '0.85rem',
                    background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
                    border: 'none', borderRadius: 12,
                    color: '#1a0a00', fontWeight: 800, fontSize: '0.9rem',
                    letterSpacing: '0.4px', textTransform: 'uppercase',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                    boxShadow: '0 4px 16px rgba(255,111,35,0.25)',
                  }}
                >
                  {saving ? 'Saving…' : existing ? 'Update Request' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={() => supabase.auth.signOut().then(() => window.location.href = '/')}
                  style={{
                    padding: '0.85rem 1.25rem', borderRadius: 12,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)', fontWeight: 600, fontSize: '0.9rem',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Sign out
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }
