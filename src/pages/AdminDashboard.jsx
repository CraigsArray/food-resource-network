import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

const MAPS_KEY = 'AIzaSyATKV3W2gaC31gaDZvAd3M9rmNZk9eapxI'

const CATEGORIES = ['food-pantry','hot-meals','drive-thru','community-fridge','produce','bread','dairy','hygiene','diapers','meal-kits','other']
const NEIGHBORHOODS = ['Barrio Logan','City Heights','Clairemont','Chula Vista','Encanto','La Mesa','Linda Vista','Logan Heights','Mira Mesa','North Park','San Ysidro','South Park']

const EMPTY_FORM = {
  organization_id: '', title: '', description: '', address: '', city: 'San Diego', zip: '',
  start_time: '', end_time: '', category: 'food-pantry', tags: '', image_url: '',
  is_active: true, status: 'published', expires_at: '', neighborhood: '', location_name: '',
}

export default function AdminDashboard() {
  const { user, memberships, isAppAdmin, signOut } = useAuth()

  const [posts, setPosts]           = useState([])
  const [orgs, setOrgs]             = useState([])   // all orgs (admins) or user's orgs
  const [loadingPosts, setLoading]  = useState(true)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [editing, setEditing]       = useState(null)  // post id being edited
  const [formError, setFormError]   = useState('')
  const [saving, setSaving]         = useState(false)
  const [showForm, setShowForm]     = useState(true)
  const geocoderRef = useRef(null)
  const mapRef      = useRef(null)
  const mapDivRef   = useRef(null)

  // Derive available org options for the create form
  const orgOptions = isAppAdmin
    ? orgs
    : memberships.map(m => m.organizations).filter(Boolean)

  useEffect(() => {
    loadOrgs()
    loadPosts()
    loadMapsApi()
  }, [])

  async function loadOrgs() {
    if (isAppAdmin) {
      const { data } = await supabase.from('organizations').select('id, name, domain').order('name')
      setOrgs(data ?? [])
    }
  }

  async function loadPosts() {
    setLoading(true)
    let query = supabase
      .from('posts')
      .select('*, organizations(id, name)')
      .order('created_at', { ascending: false })

    if (!isAppAdmin) {
      const orgIds = memberships.map(m => m.organization_id)
      if (orgIds.length === 0) { setPosts([]); setLoading(false); return }
      query = query.in('organization_id', orgIds)
    }

    const { data } = await query
    setPosts(data ?? [])
    setLoading(false)
  }

  function loadMapsApi() {
    if (window.google?.maps) { initGeocoder(); return }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&callback=__initAdminMap`
    s.async = true
    window.__initAdminMap = () => initGeocoder()
    document.head.appendChild(s)
  }

  function initGeocoder() {
    geocoderRef.current = new window.google.maps.Geocoder()
    if (mapDivRef.current && !mapRef.current) {
      mapRef.current = new window.google.maps.Map(mapDivRef.current, {
        center: { lat: 32.7157, lng: -117.1611 },
        zoom: 10,
        styles: [
          { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
          { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
          { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#17263c' }] },
        ],
      })
    }
  }

  async function geocode(address) {
    if (!geocoderRef.current || !address) return null
    return new Promise(resolve => {
      geocoderRef.current.geocode({ address: `${address}, San Diego, CA` }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const loc = results[0].geometry.location
          resolve({ latitude: loc.lat(), longitude: loc.lng() })
        } else {
          resolve(null)
        }
      })
    })
  }

  function startEdit(post) {
    setEditing(post.id)
    setForm({
      organization_id: post.organization_id ?? '',
      title:           post.title ?? '',
      description:     post.description ?? '',
      address:         post.address ?? '',
      city:            post.city ?? 'San Diego',
      zip:             post.zip ?? '',
      start_time:      post.start_time ? post.start_time.slice(0, 16) : '',
      end_time:        post.end_time   ? post.end_time.slice(0, 16)   : '',
      category:        post.category  ?? 'food-pantry',
      tags:            (post.tags ?? []).join(', '),
      image_url:       post.image_url ?? '',
      is_active:       post.is_active ?? true,
      status:          post.status ?? 'published',
      expires_at:      post.expires_at ? post.expires_at.slice(0, 10) : '',
      neighborhood:    post.neighborhood ?? '',
      location_name:   post.location_name ?? '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')

    if (!form.title.trim())           return setFormError('Title is required.')
    if (!form.description.trim())     return setFormError('Description is required.')
    if (!form.organization_id)        return setFormError('Select an organization.')

    setSaving(true)

    const coords = form.address ? await geocode(form.address) : {}

    const payload = {
      organization_id: form.organization_id,
      title:           form.title.trim(),
      description:     form.description.trim(),
      address:         form.address.trim(),
      city:            form.city.trim(),
      zip:             form.zip.trim(),
      start_time:      form.start_time  || null,
      end_time:        form.end_time    || null,
      expires_at:      form.expires_at  || null,
      category:        form.category,
      tags:            form.tags.split(',').map(t => t.trim()).filter(Boolean),
      image_url:       form.image_url.trim(),
      is_active:       form.is_active,
      status:          form.status,
      ...(coords ?? {}),
    }

    let err
    if (editing) {
      ;({ error: err } = await supabase.from('posts').update(payload).eq('id', editing))
    } else {
      ;({ error: err } = await supabase.from('posts').insert(payload))
    }

    setSaving(false)

    if (err) {
      setFormError(err.message)
    } else {
      cancelEdit()
      loadPosts()
    }
  }

  async function deletePost(id) {
    if (!confirm('Delete this post? This cannot be undone.')) return
    await supabase.from('posts').delete().eq('id', id)
    setPosts(p => p.filter(post => post.id !== id))
  }

  async function toggleActive(post) {
    await supabase.from('posts').update({ is_active: !post.is_active }).eq('id', post.id)
    setPosts(p => p.map(x => x.id === post.id ? { ...x, is_active: !post.is_active } : x))
  }

  const f = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  return (
    <div style={{ minHeight: '100vh', padding: '1.5rem' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div className="page-header" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', position: 'relative', zIndex: 1 }}>
            <div>
              <h1>Admin Dashboard</h1>
              <p>{user?.email} {isAppAdmin && <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>APP ADMIN</span>}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {isAppAdmin && (
                <Link to="/admin/pending-providers" style={{
                  background: 'rgba(255,255,255,0.2)', color: 'white', padding: '8px 16px',
                  borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)',
                }}>
                  Pending Providers
                </Link>
              )}
              <a href="/" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', padding: '8px 16px', borderRadius: 10, fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>
                Public Feed
              </a>
              <button onClick={signOut} style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 10, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                Sign out
              </button>
            </div>
          </div>
        </div>

        {/* Create / edit form */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 700 }}>
              {editing ? '✏️ Edit Post' : '➕ New Resource Post'}
            </h2>
            <button
              className="btn-secondary"
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
              onClick={() => setShowForm(v => !v)}
            >
              {showForm ? 'Collapse ▲' : 'Expand ▼'}
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Org + status row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    Organization <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <select className="form-input" value={form.organization_id} onChange={e => f('organization_id', e.target.value)} required>
                    <option value="">Select…</option>
                    {orgOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Status</label>
                  <select className="form-input" value={form.status} onChange={e => f('status', e.target.value)}>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="pending_review">Pending Review</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Category</label>
                  <select className="form-input" value={form.category} onChange={e => f('category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Title */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  Title <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <input className="form-input" value={form.title} onChange={e => f('title', e.target.value)} required placeholder="e.g. Drive-thru produce distribution (Linda Vista)" />
              </div>

              {/* Description */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  Description <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <textarea className="form-input" rows={4} value={form.description} onChange={e => f('description', e.target.value)} required placeholder="What's available, pickup instructions, times, requirements…" style={{ resize: 'vertical' }} />
              </div>

              {/* Location row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Neighborhood</label>
                  <select className="form-input" value={form.neighborhood} onChange={e => f('neighborhood', e.target.value)}>
                    <option value="">Select…</option>
                    {NEIGHBORHOODS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Location name</label>
                  <input className="form-input" value={form.location_name} onChange={e => f('location_name', e.target.value)} placeholder="e.g. Parking lot on Orange Ave" />
                </div>
              </div>

              {/* Address row */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Street address</label>
                  <input className="form-input" value={form.address} onChange={e => f('address', e.target.value)} placeholder="1234 Main St" />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>City</label>
                  <input className="form-input" value={form.city} onChange={e => f('city', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>ZIP</label>
                  <input className="form-input" value={form.zip} onChange={e => f('zip', e.target.value)} placeholder="92101" />
                </div>
              </div>

              {/* Time row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Start time</label>
                  <input className="form-input" type="datetime-local" value={form.start_time} onChange={e => f('start_time', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>End time</label>
                  <input className="form-input" type="datetime-local" value={form.end_time} onChange={e => f('end_time', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Expires (date)</label>
                  <input className="form-input" type="date" value={form.expires_at} onChange={e => f('expires_at', e.target.value)} />
                </div>
              </div>

              {/* Tags + image */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Tags</label>
                  <input className="form-input" value={form.tags} onChange={e => f('tags', e.target.value)} placeholder="produce, pantry, hot-meals" />
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>Comma-separated</p>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Image URL</label>
                  <input className="form-input" type="url" value={form.image_url} onChange={e => f('image_url', e.target.value)} placeholder="https://…" />
                </div>
              </div>

              {/* Active toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => f('is_active', e.target.checked)} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                <label htmlFor="is_active" style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)', cursor: 'pointer' }}>Active (visible on public feed)</label>
              </div>

              {formError && <p style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{formError}</p>}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn-primary" type="submit" disabled={saving} style={{ flex: 2, justifyContent: 'center' }}>
                  {saving ? 'Saving…' : editing ? 'Update post' : 'Publish post'}
                </button>
                {editing && (
                  <button className="btn-secondary" type="button" onClick={cancelEdit}>Cancel</button>
                )}
                {!editing && (
                  <button className="btn-secondary" type="button" onClick={() => setForm(EMPTY_FORM)}>Clear</button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Map */}
        <div
          ref={mapDivRef}
          style={{ width: '100%', height: 380, borderRadius: 16, marginBottom: '1.5rem', background: 'var(--color-bg-light)', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}
        />

        {/* Posts list */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.25rem', fontWeight: 700 }}>
              📋 {isAppAdmin ? 'All Posts' : 'Your Organization\'s Posts'} ({posts.length})
            </h2>
            <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={loadPosts}>↻ Refresh</button>
          </div>

          {loadingPosts ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>Loading posts…</p>
          ) : posts.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>No posts yet — create one above!</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {posts.map(post => (
                <div key={post.id} style={{
                  background: 'var(--color-bg-light)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1rem',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{post.title}</span>
                      <span className={`status-badge status-${post.status}`}>{post.status}</span>
                      {!post.is_active && <span className="status-badge status-archived">inactive</span>}
                    </div>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {post.organizations?.name} · {post.address || 'No address'} · {new Date(post.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
                    <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '5px 12px' }} onClick={() => toggleActive(post)}>
                      {post.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '5px 12px' }} onClick={() => startEdit(post)}>
                      Edit
                    </button>
                    <button className="btn-danger" onClick={() => deletePost(post.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
