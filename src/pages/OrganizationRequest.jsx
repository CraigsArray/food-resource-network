import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

export default function OrganizationRequest() {
  const { user, session, memberships } = useAuth()
  const navigate = useNavigate()

  const [existing, setExisting] = useState(null)  // existing pending_organizations row
  const [form, setForm] = useState({ requested_name: '', website: '', phone: '', notes: '' })
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)

  // If the user already has an org membership, send them to admin
  useEffect(() => {
    if (memberships.length > 0) navigate('/admin', { replace: true })
  }, [memberships, navigate])

  // Load any existing pending request for this user
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

  if (!session) {
    navigate('/login')
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSaving(true)

    const { error: err } = await supabase
      .from('pending_organizations')
      .update({
        requested_name: form.requested_name,
        website:        form.website,
        phone:          form.phone,
        notes:          form.notes,
      })
      .eq('id', existing?.id)
      .eq('user_id', user.id)

    if (err) {
      setError(err.message)
    } else {
      setSuccess(true)
    }

    setSaving(false)
  }

  const domain = user?.email?.split('@')[1] ?? 'your domain'

  const statusColor = {
    pending:  'var(--color-warning, hsl(45,100%,51%))',
    approved: 'var(--color-success)',
    rejected: 'var(--color-error)',
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        <div className="page-header" style={{ background: 'linear-gradient(135deg, hsl(220,50%,35%), hsl(260,50%,40%))' }}>
          <h1>Access Request</h1>
          <p>Signed in as <strong>{user?.email}</strong></p>
        </div>

        {/* Status notice */}
        {existing && (
          <div className="card" style={{ marginBottom: '1.5rem', borderLeft: `4px solid ${statusColor[existing.status] ?? 'var(--color-border)'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 700 }}>Request status:</span>
              <span className={`status-badge status-${existing.status}`}>{existing.status}</span>
            </div>
            {existing.status === 'pending' && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                Your request is under review. We'll notify you by email when it's approved.
                You can update your organization details below while you wait.
              </p>
            )}
            {existing.status === 'approved' && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                Your organization has been approved! <a href="/admin" style={{ color: 'var(--color-accent)' }}>Go to admin dashboard →</a>
              </p>
            )}
            {existing.status === 'rejected' && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                Your request was not approved. Please contact us if you believe this is a mistake.
              </p>
            )}
          </div>
        )}

        {!existing && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
              Your email domain <strong style={{ color: 'var(--color-primary)' }}>@{domain}</strong> doesn't match
              a verified provider in our system. Submit your organization's information below
              for admin review. Once approved, you'll be able to create and manage food access
              posts for your organization.
            </p>
          </div>
        )}

        {existing?.status !== 'rejected' && (
          <div className="card">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
              {existing ? 'Update organization details' : 'Organization information'}
            </h2>

            {success && (
              <p style={{ color: 'var(--color-success)', marginBottom: '1rem', fontWeight: 600 }}>
                ✓ Details saved successfully.
              </p>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>
                  Organization name <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <input
                  className="form-input"
                  required
                  value={form.requested_name}
                  onChange={e => setForm(f => ({ ...f, requested_name: e.target.value }))}
                  placeholder="e.g. San Diego Food Bank"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Website</label>
                  <input className="form-input" type="url" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Phone</label>
                  <input className="form-input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(619) 555-0100" />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.4rem' }}>Additional notes</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Anything else we should know about your organization's food access work…"
                  style={{ resize: 'vertical' }}
                />
              </div>

              {error && <p style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{error}</p>}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button className="btn-primary" type="submit" disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
                  {saving ? 'Saving…' : existing ? 'Update request' : 'Submit request'}
                </button>
                <button className="btn-secondary" type="button" onClick={() => supabase.auth.signOut().then(() => window.location.href = '/')}>
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
