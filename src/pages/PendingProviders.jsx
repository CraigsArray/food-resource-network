import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

const STATUS_COLOR = {
  pending:  { bg: 'hsla(45,100%,51%,0.15)', color: 'hsl(45,100%,65%)', border: 'hsla(45,100%,51%,0.3)' },
  approved: { bg: 'hsla(142,60%,45%,0.15)', color: 'hsl(142,70%,65%)', border: 'hsla(142,60%,45%,0.3)' },
  rejected: { bg: 'hsla(0,84%,60%,0.15)',   color: 'hsl(0,84%,70%)',   border: 'hsla(0,84%,60%,0.3)' },
}

export default function PendingProviders() {
  const { user, signOut } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('pending')   // 'pending' | 'approved' | 'rejected' | 'all'
  const [approving, setApproving] = useState(null)      // pending request id currently being approved
  const [approveForm, setApproveForm] = useState({ name: '', domain: '', website: '', phone: '' })
  const [actionError, setActionError] = useState('')

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('pending_organizations')
      .select('*, profiles(email, full_name)')
      .order('created_at', { ascending: false })
    if (filter !== 'all') q = q.eq('status', filter)
    const { data } = await q
    setRequests(data ?? [])
    setLoading(false)
  }

  function openApproveModal(req) {
    setApproving(req.id)
    setApproveForm({
      name:    req.requested_name ?? '',
      domain:  req.requested_domain ?? '',
      website: req.website ?? '',
      phone:   req.phone ?? '',
    })
    setActionError('')
  }

  async function handleApprove(e) {
    e.preventDefault()
    setActionError('')

    if (!approveForm.name.trim())   return setActionError('Organization name is required.')
    if (!approveForm.domain.trim()) return setActionError('Domain is required.')

    const { data, error } = await supabase.rpc('approve_pending_org', {
      p_pending_id: approving,
      p_org_name:   approveForm.name.trim(),
      p_domain:     approveForm.domain.trim().toLowerCase(),
      p_website:    approveForm.website.trim() || null,
      p_phone:      approveForm.phone.trim()   || null,
    })

    if (error) {
      setActionError(error.message)
    } else {
      setApproving(null)
      load()
    }
  }

  async function handleReject(id) {
    if (!confirm('Reject this request?')) return
    const { error } = await supabase.rpc('reject_pending_org', { p_pending_id: id })
    if (error) alert(error.message)
    else load()
  }

  return (
    <div style={{ minHeight: '100vh', padding: '1.5rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div className="page-header" style={{ background: 'linear-gradient(135deg, hsl(220,50%,30%), hsl(270,50%,35%))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', position: 'relative', zIndex: 1 }}>
            <div>
              <h1>Pending Providers</h1>
              <p>Review and approve organization access requests</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Link to="/admin" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', padding: '8px 16px', borderRadius: 10, fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>
                ← Dashboard
              </Link>
              <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 10, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                Sign out
              </button>
            </div>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {['pending', 'approved', 'rejected', 'all'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: '6px 18px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
                border: filter === s ? 'none' : '1px solid var(--color-border)',
                background: filter === s ? 'var(--color-primary)' : 'var(--color-surface)',
                color: filter === s ? 'white' : 'var(--color-text-secondary)',
                textTransform: 'capitalize',
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Requests list */}
        {loading ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>Loading…</p>
        ) : requests.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-muted)' }}>
            No {filter !== 'all' ? filter : ''} requests found.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {requests.map(req => {
              const sc = STATUS_COLOR[req.status] ?? STATUS_COLOR.pending
              return (
                <div key={req.id} className="card" style={{ borderLeft: `4px solid ${sc.border}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      {/* Submitter info */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700 }}>{req.profiles?.email ?? req.email}</span>
                        {req.profiles?.full_name && (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>({req.profiles.full_name})</span>
                        )}
                        <span style={{ padding: '2px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                          {req.status}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        {req.requested_name   && <span>🏢 <strong>{req.requested_name}</strong></span>}
                        {req.requested_domain && <span>🌐 @{req.requested_domain}</span>}
                        {req.website          && <span>🔗 {req.website}</span>}
                        {req.phone            && <span>📞 {req.phone}</span>}
                      </div>

                      {req.notes && (
                        <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                          "{req.notes}"
                        </p>
                      )}

                      <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        Submitted {new Date(req.created_at).toLocaleString()}
                        {req.reviewed_at && ` · Reviewed ${new Date(req.reviewed_at).toLocaleString()}`}
                      </p>
                    </div>

                    {/* Actions */}
                    {req.status === 'pending' && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'flex-start' }}>
                        <button
                          className="btn-primary"
                          style={{ fontSize: '0.85rem', padding: '8px 18px' }}
                          onClick={() => openApproveModal(req)}
                        >
                          Approve
                        </button>
                        <button className="btn-danger" onClick={() => handleReject(req.id)}>
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Approve modal */}
        {approving && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem',
          }}>
            <div className="card" style={{ width: '100%', maxWidth: 520 }}>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem' }}>
                Approve Organization
              </h2>
              <form onSubmit={handleApprove} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    Organization name <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <input className="form-input" required value={approveForm.name} onChange={e => setApproveForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    Email domain <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <input className="form-input" required value={approveForm.domain} onChange={e => setApproveForm(f => ({ ...f, domain: e.target.value }))} placeholder="feedingsandiego.org" />
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                    All users with this domain will automatically receive access.
                  </p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Website</label>
                    <input className="form-input" type="url" value={approveForm.website} onChange={e => setApproveForm(f => ({ ...f, website: e.target.value }))} placeholder="https://…" />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Phone</label>
                    <input className="form-input" value={approveForm.phone} onChange={e => setApproveForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                </div>
                {actionError && <p style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{actionError}</p>}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <button className="btn-primary" type="submit" style={{ flex: 1, justifyContent: 'center' }}>Confirm Approval</button>
                  <button className="btn-secondary" type="button" onClick={() => setApproving(null)}>Cancel</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
