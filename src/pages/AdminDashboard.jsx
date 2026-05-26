import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { 'en-US': enUS } })

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

const CATEGORIES = [
  { value: 'food-pantry',       label: 'Food Pantry' },
  { value: 'food-distribution', label: 'Food Distribution' },
  { value: 'meal',              label: 'Meal' },
]

const NEIGHBORHOODS = ['Alpine','El Cajon','Jamul','La Mesa','Lakeside','Lemon Grove','Rancho San Diego','Santee','Spring Valley','Other']

const EMPTY_FORM = {
  title: '', description: '', address: '', city: 'El Cajon', zip: '',
  event_date: '', start_time_only: '', end_time_only: '',
  category: 'food-pantry', tags: '', image_url: '',
  is_active: true, status: 'published', neighborhood: '', location_name: '',
  is_recurring: false,
}

function newOccurrence() {
  return { _key: crypto.randomUUID(), id: null, start_time: '', end_time: '' }
}

export default function AdminDashboard() {
  const { user, profile, memberships, isAppAdmin, signOut } = useAuth()
  const primaryOrgId = memberships[0]?.organization_id

  // ── User profile state ─────────────────────────────────────
  const [profileForm, setProfileForm]     = useState({ full_name: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSuccess, setProfileSuccess] = useState(false)
  const [profileError, setProfileError]   = useState('')
  const [showProfile, setShowProfile]     = useState(true)
  const pf = (key, val) => setProfileForm(prev => ({ ...prev, [key]: val }))

  // ── Org profile state ──────────────────────────────────────
  const [orgData, setOrgData]         = useState(null)
  const [orgForm, setOrgForm]         = useState({ name: '', website: '', phone: '', email: '', logo_url: '' })
  const [logoFile, setLogoFile]       = useState(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [showOrg, setShowOrg]         = useState(true)
  const [orgSaving, setOrgSaving]     = useState(false)
  const [orgSuccess, setOrgSuccess]   = useState(false)
  const [orgError, setOrgError]       = useState('')

  // ── Post form state ────────────────────────────────────────
  const [posts, setPosts]             = useState([])
  const [loadingPosts, setLoading]    = useState(true)
  const [form, setForm]               = useState(EMPTY_FORM)
  const [occurrences, setOccurrences] = useState([newOccurrence()])
  const [imageMode, setImageMode]     = useState('url')
  const [imageFile, setImageFile]     = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [editing, setEditing]         = useState(null)
  const [formError, setFormError]     = useState('')
  const [saving, setSaving]           = useState(false)
  const [showForm, setShowForm]       = useState(true)

  // ── Recurrence pattern state ───────────────────────────────
  const [recurPattern, setRecurPattern] = useState({
    frequency: 'weekly',   // 'daily' | 'weekly' | 'biweekly' | 'monthly'
    days: [],              // days of week: 0=Sun,1=Mon,...,6=Sat
    startDate: '',         // YYYY-MM-DD
    endDate: '',           // YYYY-MM-DD
    eventStartTime: '',    // HH:MM
    eventEndTime: '',      // HH:MM
  })

  const geocoderRef = useRef(null)
  const f   = (key, val) => setForm(prev => ({ ...prev, [key]: val }))
  const of  = (key, val) => setOrgForm(prev => ({ ...prev, [key]: val }))
  const rpf = (key, val) => setRecurPattern(prev => ({ ...prev, [key]: val }))

  useEffect(() => { loadPosts(); loadMapsApi() }, [])
  useEffect(() => { if (primaryOrgId) loadOrgData(primaryOrgId) }, [primaryOrgId])
  useEffect(() => { if (profile) setProfileForm({ full_name: profile.full_name ?? '' }) }, [profile])

  // ── User profile ──────────────────────────────────────────
  async function saveProfile(e) {
    e.preventDefault()
    setProfileError('')
    setProfileSuccess(false)
    setProfileSaving(true)
    const { error } = await supabase.from('profiles')
      .update({ full_name: profileForm.full_name.trim() })
      .eq('id', user.id)
    setProfileSaving(false)
    if (error) setProfileError(error.message)
    else setProfileSuccess(true)
  }

  // ── Org ───────────────────────────────────────────────────
  async function loadOrgData(orgId) {
    const { data } = await supabase.from('organizations').select('*').eq('id', orgId).single()
    if (data) {
      setOrgData(data)
      setOrgForm({ name: data.name ?? '', website: data.website ?? '', phone: data.phone ?? '', email: data.email ?? '', logo_url: data.logo_url ?? '' })
      if (data.logo_url) setLogoPreview(data.logo_url)
    }
  }

  async function saveOrg(e) {
    e.preventDefault()
    setOrgError('')
    setOrgSuccess(false)
    setOrgSaving(true)

    let logo_url = orgForm.logo_url
    if (logoFile) {
      const ext  = logoFile.name.split('.').pop()
      const path = `${primaryOrgId}/logo.${ext}`
      const { error: upErr } = await supabase.storage.from('post-images').upload(path, logoFile, { upsert: true })
      if (upErr) { setOrgError('Logo upload failed: ' + upErr.message); setOrgSaving(false); return }
      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path)
      logo_url = publicUrl
      setLogoPreview(publicUrl)
    }

    const updates = { name: orgForm.name, website: orgForm.website, phone: orgForm.phone, email: orgForm.email, logo_url }
    const { error: err, count } = await supabase.from('organizations')
      .update(updates, { count: 'exact' })
      .eq('id', primaryOrgId)

    setOrgSaving(false)
    if (err) {
      setOrgError(err.message)
    } else if (count === 0) {
      setOrgError('Save failed — the database policy needs updating. Run the SQL snippet below in your Supabase SQL Editor.')
    } else {
      setOrgForm(f => ({ ...f, logo_url }))
      setOrgData(prev => ({ ...prev, ...updates }))
      setOrgSuccess(true)
    }
  }

  // ── Posts ─────────────────────────────────────────────────
  async function loadPosts() {
    setLoading(true)
    let q = supabase.from('posts').select('*, organizations(id, name)').order('created_at', { ascending: false })
    if (!isAppAdmin) {
      const ids = memberships.map(m => m.organization_id)
      if (ids.length === 0) { setPosts([]); setLoading(false); return }
      q = q.in('organization_id', ids)
    }
    const { data } = await q
    setPosts(data ?? [])
    setLoading(false)
  }

  function loadMapsApi() {
    if (window.google?.maps) { initMap(); return }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&callback=__initAdminMap`
    s.async = true
    window.__initAdminMap = initMap
    document.head.appendChild(s)
  }

  function initMap() {
    geocoderRef.current = new window.google.maps.Geocoder()
  }

  async function geocode(address) {
    if (!geocoderRef.current || !address) return null
    return new Promise(resolve => {
      geocoderRef.current.geocode({ address: `${address}, San Diego, CA` }, (results, status) => {
        resolve(status === 'OK' && results[0]
          ? { latitude: results[0].geometry.location.lat(), longitude: results[0].geometry.location.lng() }
          : null)
      })
    })
  }

  // ── Occurrences ───────────────────────────────────────────
  function addOccurrence() {
    setOccurrences(prev => [...prev, newOccurrence()])
  }
  function removeOccurrence(key) {
    setOccurrences(prev => prev.length > 1 ? prev.filter(o => o._key !== key) : prev)
  }
  function updateOccurrence(key, field, value) {
    setOccurrences(prev => prev.map(o => o._key === key ? { ...o, [field]: value } : o))
  }

  function generateFromPattern() {
    const { frequency, days, startDate, endDate, eventStartTime, eventEndTime } = recurPattern
    if (!startDate || !endDate) return
    if ((frequency === 'weekly' || frequency === 'biweekly') && days.length === 0) return

    const results = []
    const origin = new Date(startDate + 'T12:00:00')
    const end    = new Date(endDate   + 'T12:00:00')
    const cur    = new Date(origin)

    while (cur <= end && results.length < 366) {
      const dow      = cur.getDay()
      const diffDays = Math.round((cur - origin) / 86400000)
      const weekIdx  = Math.floor(diffDays / 7)

      const include =
        frequency === 'daily'     ? true :
        frequency === 'weekly'    ? days.includes(dow) :
        frequency === 'biweekly'  ? (days.includes(dow) && weekIdx % 2 === 0) :
        frequency === 'monthly'   ? (cur.getDate() === origin.getDate()) :
        false

      if (include) {
        const y = cur.getFullYear()
        const m = String(cur.getMonth() + 1).padStart(2, '0')
        const d = String(cur.getDate()).padStart(2, '0')
        const ds = `${y}-${m}-${d}`
        results.push({
          _key:       crypto.randomUUID(),
          id:         null,
          start_time: eventStartTime ? `${ds}T${eventStartTime}` : '',
          end_time:   eventEndTime   ? `${ds}T${eventEndTime}`   : '',
        })
      }
      cur.setDate(cur.getDate() + 1)
    }
    if (results.length > 0) setOccurrences(results)
  }

  async function startEdit(post) {
    setEditing(post.id)
    setForm({
      title:           post.title         ?? '',
      description:     post.description   ?? '',
      address:         post.address       ?? '',
      city:            post.city          ?? 'El Cajon',
      zip:             post.zip           ?? '',
      event_date:      post.start_time    ? post.start_time.slice(0, 10)    : '',
      start_time_only: post.start_time    ? post.start_time.slice(11, 16)   : '',
      end_time_only:   post.end_time      ? post.end_time.slice(11, 16)     : '',
      category:        post.category      ?? 'food-pantry',
      tags:          (post.tags ?? []).join(', '),
      image_url:     post.image_url     ?? '',
      is_active:     post.is_active     ?? true,
      status:        post.status        ?? 'published',
      neighborhood:  post.neighborhood  ?? '',
      location_name: post.location_name ?? '',
      is_recurring:  post.is_recurring  ?? false,
    })
    if (post.image_url) setImagePreview(post.image_url)
    setImageMode('url')

    if (post.is_recurring) {
      const { data: occ } = await supabase
        .from('post_occurrences')
        .select('id, start_time, end_time')
        .eq('post_id', post.id)
        .order('start_time', { ascending: true })

      setOccurrences(
        occ && occ.length > 0
          ? occ.map(o => ({
              _key:       o.id,
              id:         o.id,
              start_time: o.start_time ? o.start_time.slice(0, 16) : '',
              end_time:   o.end_time   ? o.end_time.slice(0, 16)   : '',
            }))
          : [newOccurrence()]
      )
    } else {
      setOccurrences([newOccurrence()])
    }

    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setOccurrences([newOccurrence()])
    setFormError('')
    setImageFile(null)
    setImagePreview('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    if (!form.title.trim())       return setFormError('Title is required.')
    if (!form.description.trim()) return setFormError('Description is required.')
    if (!primaryOrgId && !isAppAdmin) return setFormError('No organization found for your account.')

    if (!form.address.trim()) {
      return setFormError('Street address is required.')
    }
    if (!form.is_recurring && (!form.event_date || !form.start_time_only)) {
      return setFormError('Event date and start time are required.')
    }
    if (form.is_recurring && occurrences.filter(o => o.start_time).length === 0) {
      return setFormError('Add at least one date for the recurring event.')
    }

    setSaving(true)

    let image_url = form.image_url.trim()
    if (imageMode === 'file' && imageFile) {
      const ext  = imageFile.name.split('.').pop()
      const path = `${primaryOrgId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('post-images').upload(path, imageFile, { upsert: false })
      if (upErr) { setFormError('Image upload failed: ' + upErr.message); setSaving(false); return }
      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path)
      image_url = publicUrl
    }

    const coords = form.address ? await geocode(form.address) : null
    const firstOcc = form.is_recurring ? occurrences.find(o => o.start_time) : null

    const payload = {
      organization_id: primaryOrgId,
      title:           form.title.trim(),
      description:     form.description.trim(),
      address:         form.address.trim(),
      city:            form.city.trim(),
      zip:             form.zip.trim(),
      neighborhood:    form.neighborhood,
      location_name:   form.location_name.trim(),
      start_time:      form.is_recurring ? (firstOcc?.start_time || null) : (form.event_date && form.start_time_only ? `${form.event_date}T${form.start_time_only}` : null),
      end_time:        form.is_recurring ? (firstOcc?.end_time   || null) : (form.event_date && form.end_time_only   ? `${form.event_date}T${form.end_time_only}`   : null),
      category:        form.category,
      tags:            form.tags.split(',').map(t => t.trim()).filter(Boolean),
      image_url,
      is_active:       form.is_active,
      status:          form.status,
      is_recurring:    form.is_recurring,
      recurrence_rule: null,
      ...(coords ?? {}),
    }

    let err, postId
    if (editing) {
      ;({ error: err } = await supabase.from('posts').update(payload).eq('id', editing))
      postId = editing
    } else {
      const { data: newPost, error: insertErr } = await supabase.from('posts').insert(payload).select('id').single()
      err    = insertErr
      postId = newPost?.id
    }

    if (err) { setFormError(err.message); setSaving(false); return }

    // Sync occurrences — delete all then re-insert for simplicity
    await supabase.from('post_occurrences').delete().eq('post_id', postId)

    if (form.is_recurring && postId) {
      const rows = occurrences
        .filter(o => o.start_time)
        .map(o => ({ post_id: postId, start_time: o.start_time, end_time: o.end_time || null }))

      if (rows.length > 0) {
        const { error: occErr } = await supabase.from('post_occurrences').insert(rows)
        if (occErr) { setFormError('Post saved but failed to save dates: ' + occErr.message); setSaving(false); return }
      }
    }

    setSaving(false)
    cancelEdit()
    loadPosts()
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-dark)' }}>

      {/* ── Header ────────────────────────────────────────── */}
      <header style={{
        background: 'linear-gradient(135deg, hsl(28,95%,55%) 0%, hsl(340,82%,52%) 100%)',
        padding: '1.25rem 2rem',
        boxShadow: '0 2px 16px rgba(0,0,0,0.15)',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.5rem', color: 'white' }}>Profile & Organization Admin Dashboard</h1>
            <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.82rem', marginTop: 2 }}>
              {user?.email}{isAppAdmin && <span style={{ marginLeft: 8, background: 'rgba(255,255,255,0.25)', borderRadius: 5, padding: '1px 7px', fontSize: '0.7rem', fontWeight: 700 }}>APP ADMIN</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {isAppAdmin && <Link to="/admin/pending-providers" style={hdrBtn}>Pending Providers</Link>}
            <a href="/" style={hdrBtn}>Public Feed</a>
            <button onClick={signOut} style={{ ...hdrBtn, border: 'none', cursor: 'pointer' }}>Sign out</button>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* ── Section 1: My Profile ─────────────────────────── */}
        <section style={sectionCard}>
          <SectionHeader title="My Profile" icon="👤" open={showProfile} onToggle={() => setShowProfile(v => !v)} />
          {showProfile && (
            <form onSubmit={saveProfile} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={labelSt}>Full name</label>
                  <input className="form-input" value={profileForm.full_name} onChange={e => pf('full_name', e.target.value)} placeholder="Your name" />
                </div>
                <div>
                  <label style={labelSt}>Email <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>(read-only)</span></label>
                  <input className="form-input" value={user?.email ?? ''} readOnly style={{ opacity: 0.6, cursor: 'not-allowed' }} />
                </div>
              </div>
              {profileError   && <p style={{ color: 'var(--color-error)',   fontSize: '0.85rem' }}>{profileError}</p>}
              {profileSuccess && <p style={{ color: 'var(--color-success)', fontSize: '0.85rem', fontWeight: 600 }}>✓ Profile saved.</p>}
              <div>
                <button type="submit" disabled={profileSaving} style={submitBtn}>
                  {profileSaving ? 'Saving…' : 'Save Profile'}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* ── Section 2: Organization ───────────────────────── */}
        <section style={sectionCard}>
          <SectionHeader title="Organization" icon="🏢" open={showOrg} onToggle={() => setShowOrg(v => !v)} />
          {showOrg && (
            <form onSubmit={saveOrg} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{
                    width: 80, height: 80, borderRadius: 12,
                    background: logoPreview ? 'transparent' : 'var(--color-bg-light)',
                    border: '2px dashed var(--color-border)',
                    overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {logoPreview
                      ? <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: '1.75rem' }}>🏢</span>
                    }
                  </div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer' }}>
                    Upload logo
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => {
                      const file = e.target.files[0]
                      if (file) { setLogoFile(file); setLogoPreview(URL.createObjectURL(file)) }
                    }} />
                  </label>
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <label style={labelSt}>Organization name <span style={{ color: 'var(--color-error)' }}>*</span></label>
                  <input className="form-input" required value={orgForm.name} onChange={e => of('name', e.target.value)} placeholder="e.g. El Cajon Food Pantry" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <label style={labelSt}>Email</label>
                  <input className="form-input" type="email" value={orgForm.email} onChange={e => of('email', e.target.value)} placeholder="contact@org.org" />
                </div>
                <div>
                  <label style={labelSt}>Phone</label>
                  <input className="form-input" type="tel" value={orgForm.phone} onChange={e => of('phone', e.target.value)} placeholder="(619) 555-0100" />
                </div>
                <div>
                  <label style={labelSt}>Website</label>
                  <input className="form-input" type="url" value={orgForm.website} onChange={e => of('website', e.target.value)} placeholder="https://..." />
                </div>
              </div>

              {orgError   && <p style={{ color: 'var(--color-error)',   fontSize: '0.85rem' }}>{orgError}</p>}
              {orgSuccess && <p style={{ color: 'var(--color-success)', fontSize: '0.85rem', fontWeight: 600 }}>✓ Saved successfully.</p>}

              <div>
                <button type="submit" disabled={orgSaving} style={submitBtn}>
                  {orgSaving ? 'Saving…' : 'Save Organization'}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* ── Section 3: New / Edit Post ─────────────────────── */}
        <section style={sectionCard}>
          <SectionHeader
            title={editing ? 'Edit Post' : 'New Resource Post'}
            icon={editing ? '✏️' : '＋'}
            open={showForm}
            onToggle={() => setShowForm(v => !v)}
          />

          {showForm && (
            <form onSubmit={handleSubmit} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Category */}
              <div>
                <label style={labelSt}>Category</label>
                <select className="form-input" value={form.category} onChange={e => f('category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <Divider label="Details" />

              <div>
                <label style={labelSt}>Title <span style={{ color: 'var(--color-error)' }}>*</span></label>
                <input className="form-input" required value={form.title} onChange={e => f('title', e.target.value)} placeholder="e.g. Weekly produce distribution — El Cajon" />
              </div>

              <div>
                <label style={labelSt}>Description <span style={{ color: 'var(--color-error)' }}>*</span></label>
                <textarea className="form-input" rows={4} required value={form.description} onChange={e => f('description', e.target.value)} placeholder="What's available, pickup instructions, requirements…" style={{ resize: 'vertical' }} />
              </div>

              <Divider label="Location" />

              <div>
                <label style={labelSt}>Location name</label>
                <input className="form-input" value={form.location_name} onChange={e => f('location_name', e.target.value)} placeholder="e.g. First Baptist Church parking lot" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem' }}>
                <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
                  <label style={labelSt}>Street address <span style={{ color: 'var(--color-error)' }}>*</span></label>
                  <input className="form-input" value={form.address} onChange={e => f('address', e.target.value)} placeholder="1234 Main St" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={labelSt}>City</label>
                  <input className="form-input" value={form.city} onChange={e => f('city', e.target.value)} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <label style={labelSt}>ZIP</label>
                  <input className="form-input" value={form.zip} onChange={e => f('zip', e.target.value)} placeholder="92020" />
                </div>
              </div>

              <Divider label="Schedule" />

              {/* Recurring toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', userSelect: 'none' }}>
                <div
                  onClick={() => f('is_recurring', !form.is_recurring)}
                  style={{
                    width: 42, height: 24, borderRadius: 12, position: 'relative', transition: 'background 200ms',
                    background: form.is_recurring ? 'var(--color-primary)' : 'var(--color-surface)',
                    border: '1px solid var(--color-border)', cursor: 'pointer', flexShrink: 0,
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 3, left: form.is_recurring ? 20 : 3,
                    width: 16, height: 16, borderRadius: '50%', background: 'white',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 200ms',
                  }} />
                </div>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Recurring event</span>
              </label>

              {/* Single date (non-recurring) */}
              {!form.is_recurring && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={labelSt}>Date <span style={{ color: 'var(--color-error)' }}>*</span></label>
                    <input className="form-input" type="date" value={form.event_date} onChange={e => f('event_date', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelSt}>Start time <span style={{ color: 'var(--color-error)' }}>*</span></label>
                    <input className="form-input" type="time" value={form.start_time_only} onChange={e => f('start_time_only', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelSt}>End time <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></label>
                    <input className="form-input" type="time" value={form.end_time_only} onChange={e => f('end_time_only', e.target.value)} />
                  </div>
                </div>
              )}

              {/* Multiple dates (recurring) */}
              {form.is_recurring && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                  {/* ── Pattern builder ── */}
                  <div style={{ background: 'var(--color-bg-light)', borderRadius: 12, border: '1px solid var(--color-border)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Auto-generate dates</span>

                    {/* Frequency */}
                    <div>
                      <label style={labelSt}>Repeat</label>
                      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                        {[['daily','Daily'],['weekly','Weekly'],['biweekly','Bi-weekly'],['monthly','Monthly']].map(([val, lbl]) => (
                          <button key={val} type="button" onClick={() => rpf('frequency', val)} style={{
                            padding: '4px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1px solid',
                            background:   recurPattern.frequency === val ? 'var(--color-primary)' : 'var(--color-surface)',
                            color:        recurPattern.frequency === val ? 'white' : 'var(--color-text-muted)',
                            borderColor:  recurPattern.frequency === val ? 'var(--color-primary)' : 'var(--color-border)',
                          }}>{lbl}</button>
                        ))}
                      </div>
                    </div>

                    {/* Day-of-week selector (weekly / biweekly) */}
                    {(recurPattern.frequency === 'weekly' || recurPattern.frequency === 'biweekly') && (
                      <div>
                        <label style={labelSt}>On days</label>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d, i) => {
                            const on = recurPattern.days.includes(i)
                            return (
                              <button key={i} type="button" onClick={() => rpf('days', on ? recurPattern.days.filter(x => x !== i) : [...recurPattern.days, i])} style={{
                                width: 36, height: 36, borderRadius: '50%', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1px solid',
                                background:  on ? 'var(--color-primary)' : 'var(--color-surface)',
                                color:       on ? 'white' : 'var(--color-text-muted)',
                                borderColor: on ? 'var(--color-primary)' : 'var(--color-border)',
                              }}>{d}</button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Date range */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={labelSt}>Start date</label>
                        <input className="form-input" type="date" value={recurPattern.startDate} onChange={e => rpf('startDate', e.target.value)} />
                      </div>
                      <div>
                        <label style={labelSt}>End date</label>
                        <input className="form-input" type="date" value={recurPattern.endDate} onChange={e => rpf('endDate', e.target.value)} />
                      </div>
                    </div>

                    {/* Event time */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div>
                        <label style={labelSt}>Event start time</label>
                        <input className="form-input" type="time" value={recurPattern.eventStartTime} onChange={e => rpf('eventStartTime', e.target.value)} />
                      </div>
                      <div>
                        <label style={labelSt}>Event end time <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span></label>
                        <input className="form-input" type="time" value={recurPattern.eventEndTime} onChange={e => rpf('eventEndTime', e.target.value)} />
                      </div>
                    </div>

                    <button type="button" onClick={generateFromPattern} style={{
                      alignSelf: 'flex-start', padding: '6px 20px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700,
                      background: 'linear-gradient(135deg, hsl(28,95%,55%), hsl(340,82%,52%))',
                      color: '#1a0a00', border: 'none', cursor: 'pointer',
                    }}>
                      ↻ Generate dates ({occurrences.filter(o => o.start_time).length} so far)
                    </button>
                  </div>

                  {/* ── Manual list ── */}
                  <div style={{ background: 'var(--color-bg-light)', borderRadius: 12, border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                    <div style={{
                      padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-border)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Scheduled dates &nbsp;
                        <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>
                          ({occurrences.filter(o => o.start_time).length} set)
                        </span>
                      </span>
                      <button type="button" onClick={addOccurrence} style={{
                        padding: '4px 14px', borderRadius: 8, fontSize: '0.8rem', fontWeight: 700,
                        background: 'var(--color-primary)', color: 'white', border: 'none', cursor: 'pointer',
                      }}>
                        + Add date
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', padding: '0.5rem', gap: '0.25rem', maxHeight: 320, overflowY: 'auto' }}>
                      {occurrences.map((occ, idx) => (
                        <div key={occ._key} style={{
                          display: 'grid', gridTemplateColumns: '1fr 1fr auto',
                          gap: '0.5rem', alignItems: 'end',
                          padding: '0.5rem 0.5rem',
                          borderRadius: 8,
                          background: idx % 2 === 1 ? 'var(--color-bg-medium)' : 'transparent',
                        }}>
                          <div>
                            {idx === 0 && <label style={{ ...labelSt, marginBottom: '0.25rem' }}>Start</label>}
                            <input
                              className="form-input"
                              type="datetime-local"
                              value={occ.start_time}
                              onChange={e => updateOccurrence(occ._key, 'start_time', e.target.value)}
                            />
                          </div>
                          <div>
                            {idx === 0 && (
                              <label style={{ ...labelSt, marginBottom: '0.25rem' }}>
                                End <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(optional)</span>
                              </label>
                            )}
                            <input
                              className="form-input"
                              type="datetime-local"
                              value={occ.end_time}
                              onChange={e => updateOccurrence(occ._key, 'end_time', e.target.value)}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeOccurrence(occ._key)}
                            disabled={occurrences.length === 1}
                            title="Remove this date"
                            style={{
                              width: 30, height: 30, borderRadius: '50%', border: 'none',
                              background: occurrences.length === 1 ? 'var(--color-border)' : 'hsla(0,84%,60%,0.12)',
                              color: occurrences.length === 1 ? 'var(--color-text-muted)' : 'var(--color-error)',
                              cursor: occurrences.length === 1 ? 'not-allowed' : 'pointer',
                              fontWeight: 700, fontSize: '1.1rem',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              alignSelf: idx === 0 ? 'flex-end' : 'center',
                              flexShrink: 0,
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <Divider label="Media" />

              <div>
                <label style={labelSt}>Post image, flyer, or PDF</label>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.625rem' }}>
                  {['url', 'file'].map(m => (
                    <button key={m} type="button" onClick={() => setImageMode(m)} style={{
                      padding: '4px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', border: '1px solid',
                      background:   imageMode === m ? 'var(--color-primary)' : 'var(--color-surface)',
                      color:        imageMode === m ? 'white' : 'var(--color-text-muted)',
                      borderColor:  imageMode === m ? 'var(--color-primary)' : 'var(--color-border)',
                    }}>
                      {m === 'url' ? 'Paste URL' : 'Upload file'}
                    </button>
                  ))}
                </div>

                {imageMode === 'url' ? (
                  <input className="form-input" type="url" value={form.image_url}
                    onChange={e => { f('image_url', e.target.value); setImagePreview(e.target.value) }}
                    placeholder="https://…" />
                ) : (
                  <div
                    style={{ border: '2px dashed var(--color-border)', borderRadius: 10, padding: '1.25rem', textAlign: 'center', background: 'var(--color-bg-light)', cursor: 'pointer' }}
                    onClick={() => document.getElementById('post-image-input').click()}
                  >
                    <input id="post-image-input" type="file" accept="image/*,.pdf,.doc,.docx,.xlsx,.pptx" style={{ display: 'none' }} onChange={e => {
                      const file = e.target.files[0]
                      if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)) }
                    }} />
                    {imageFile
                      ? <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>📎 {imageFile.name}</p>
                      : <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Click to select an image, PDF, or flyer</p>
                    }
                  </div>
                )}

                {imagePreview && (() => {
                  const isImg = imageFile
                    ? ['jpg','jpeg','png','gif','webp','svg','avif','bmp'].includes(imageFile.name.split('.').pop().toLowerCase())
                    : ['jpg','jpeg','png','gif','webp','svg','avif','bmp'].includes(form.image_url.split('?')[0].toLowerCase().split('.').pop())
                  const isPdf = imageFile
                    ? imageFile.name.split('.').pop().toLowerCase() === 'pdf'
                    : form.image_url.split('?')[0].toLowerCase().endsWith('.pdf')
                  const filename = imageFile?.name ?? form.image_url.split('/').pop().split('?')[0]
                  return (
                    <div style={{ marginTop: '0.625rem', position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                      {isImg ? (
                        <img src={imagePreview} alt="Preview" style={{ maxHeight: 140, borderRadius: 8, border: '1px solid var(--color-border)' }} />
                      ) : (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '0.625rem',
                          padding: '0.625rem 0.875rem', borderRadius: 8,
                          border: `1px solid ${isPdf ? 'hsla(0,70%,55%,0.3)' : 'var(--color-border)'}`,
                          background: isPdf ? 'hsla(0,70%,55%,0.06)' : 'var(--color-bg-dark)',
                        }}>
                          {isPdf
                            ? <div style={{ width: 34, height: 34, borderRadius: 7, background: '#e53935', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: 'white', fontSize: '0.55rem', fontWeight: 900 }}>PDF</span></div>
                            : <div style={{ width: 34, height: 34, borderRadius: 7, background: 'var(--color-bg-medium)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📎</div>
                          }
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{filename}</div>
                            <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>Ready to upload</div>
                          </div>
                        </div>
                      )}
                      <button type="button"
                        onClick={() => { setImagePreview(''); setImageFile(null); f('image_url', '') }}
                        style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: '50%', background: 'var(--color-error)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        ✕
                      </button>
                    </div>
                  )
                })()}
              </div>

              <Divider label="Options" />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <label style={labelSt}>Tags <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(comma-separated)</span></label>
                  <input className="form-input" value={form.tags} onChange={e => f('tags', e.target.value)} placeholder="e.g. produce, no ID required, drive-thru" />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={form.is_active} onChange={e => f('is_active', e.target.checked)} style={{ width: 17, height: 17, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Active (public)</span>
                </label>
              </div>

              {formError && (
                <div style={{ padding: '0.75rem 1rem', background: 'hsla(0,84%,60%,0.08)', border: '1px solid hsla(0,84%,60%,0.3)', borderRadius: 8 }}>
                  <p style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{formError}</p>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem', paddingTop: '0.25rem' }}>
                <button type="submit" disabled={saving} style={{ ...submitBtn, flex: 1 }}>
                  {saving ? 'Saving…' : editing ? 'Update Post' : 'Publish Post'}
                </button>
                <button type="button" className="btn-secondary" onClick={cancelEdit} style={{ minWidth: 100 }}>
                  {editing ? 'Cancel' : 'Clear'}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* ── Calendar ──────────────────────────────────────── */}
        <section style={sectionCard}>
          <div style={{ padding: '1.125rem 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              📅 Event Calendar
            </h2>
          </div>
          <div style={{ padding: '1rem', height: 480 }}>
            <style>{`
              .admin-cal .rbc-calendar { font-family: Inter, sans-serif; color: var(--color-text-primary); height: 100%; }
              .admin-cal .rbc-toolbar { display: flex; flex-wrap: nowrap; align-items: center; gap: 0.25rem; margin-bottom: 8px; }
              .admin-cal .rbc-toolbar .rbc-btn-group { display: flex; flex-wrap: nowrap; gap: 2px; }
              .admin-cal .rbc-toolbar button { color: var(--color-text-secondary); border-color: var(--color-border); background: var(--color-bg-dark); border-radius: 6px; font-size: 0.78rem; padding: 3px 10px; white-space: nowrap; cursor: pointer; }
              .admin-cal .rbc-toolbar button:hover, .admin-cal .rbc-toolbar button.rbc-active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
              .admin-cal .rbc-toolbar-label { flex: 1; font-weight: 700; color: var(--color-text-primary); text-align: center; white-space: nowrap; }
              .admin-cal .rbc-header { background: var(--color-bg-dark); color: var(--color-text-secondary); border-color: var(--color-border); font-size: 0.75rem; padding: 4px 0; }
              .admin-cal .rbc-month-view, .admin-cal .rbc-agenda-view table { border-color: var(--color-border); }
              .admin-cal .rbc-day-bg { background: var(--color-bg-medium); }
              .admin-cal .rbc-off-range-bg { background: var(--color-bg-dark); opacity: 0.6; }
              .admin-cal .rbc-today { background: hsla(28,95%,55%,0.08) !important; }
              .admin-cal .rbc-event { background: var(--color-primary); border-radius: 4px; font-size: 0.72rem; border: none; padding: 1px 4px; cursor: pointer; }
              .admin-cal .rbc-event:hover { opacity: 0.85; }
              .admin-cal .rbc-show-more { color: var(--color-primary); font-size: 0.7rem; }
              .admin-cal .rbc-date-cell { color: var(--color-text-secondary); font-size: 0.75rem; padding: 2px 4px; }
              .admin-cal .rbc-date-cell.rbc-now { color: var(--color-primary); font-weight: 700; }
              .admin-cal .rbc-month-row { min-height: 56px; }
              .admin-cal .rbc-agenda-date-cell, .admin-cal .rbc-agenda-time-cell { color: var(--color-text-secondary); font-size: 0.82rem; }
              .admin-cal .rbc-agenda-event-cell { color: var(--color-text-primary); font-size: 0.82rem; cursor: pointer; }
            `}</style>
            <div className="admin-cal" style={{ height: '100%' }}>
              <Calendar
                localizer={localizer}
                events={posts.filter(p => p.start_time).map(p => ({
                  id: p.id,
                  title: p.title,
                  start: new Date(p.start_time),
                  end: p.end_time ? new Date(p.end_time) : new Date(p.start_time),
                  resource: p,
                }))}
                defaultView="month"
                views={['month', 'agenda']}
                style={{ height: '100%' }}
                onSelectEvent={event => startEdit(event.resource)}
                popup
              />
            </div>
          </div>
        </section>

        {/* ── Posts list ────────────────────────────────────── */}
        <section style={sectionCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.125rem 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
            <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              📋 {isAppAdmin ? 'All Posts' : "Your Organization's Posts"} ({posts.length})
            </h2>
            <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '5px 12px' }} onClick={loadPosts}>↻ Refresh</button>
          </div>

          <div style={{ padding: '1rem 1.5rem' }}>
            {loadingPosts ? (
              <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>Loading…</p>
            ) : posts.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>No posts yet — create one above!</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {posts.map(post => {
                  const cat = CATEGORIES.find(c => c.value === post.category)
                  return (
                    <div key={post.id} style={{
                      background: 'var(--color-bg-dark)', border: '1px solid var(--color-border)',
                      borderRadius: 12, padding: '1rem 1.25rem',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap',
                    }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>{post.title}</span>
                          <span className={`status-badge status-${post.status}`}>{post.status}</span>
                          {!post.is_active && <span className="status-badge status-archived">inactive</span>}
                          {post.is_recurring && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 700, background: 'hsla(28,95%,55%,0.1)', padding: '2px 8px', borderRadius: 20, border: '1px solid hsla(28,95%,55%,0.25)' }}>
                              ↺ recurring
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                          {cat?.label ?? post.category} · {post.address || 'No address'} · {post.start_time ? new Date(post.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'No date set'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
                        <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '5px 12px' }} onClick={() => startEdit(post)}>Edit</button>
                        <button className="btn-danger" onClick={() => deletePost(post.id)}>Delete</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function SectionHeader({ title, icon, open, onToggle }) {
  return (
    <div onClick={onToggle} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '1.125rem 1.5rem',
      borderBottom: open ? '1px solid var(--color-border)' : 'none',
      cursor: 'pointer', userSelect: 'none',
    }}>
      <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>{icon}</span> {title}
      </h2>
      <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>{open ? 'Collapse ▲' : 'Expand ▼'}</span>
    </div>
  )
}

function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
    </div>
  )
}

const sectionCard = {
  background: 'var(--color-bg-medium)',
  border: '1px solid var(--color-border)',
  borderRadius: 18,
  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  overflow: 'hidden',
}

const labelSt = {
  display: 'block', fontSize: '0.82rem', fontWeight: 600,
  color: 'var(--color-text-secondary)', marginBottom: '0.35rem',
}

const submitBtn = {
  padding: '0.85rem 1.5rem',
  background: 'linear-gradient(135deg, hsl(28,95%,55%), hsl(340,82%,52%))',
  border: 'none', borderRadius: 12,
  color: '#1a0a00', fontWeight: 800, fontSize: '0.9rem',
  letterSpacing: '0.4px', textTransform: 'uppercase',
  cursor: 'pointer', boxShadow: '0 4px 16px rgba(255,111,35,0.25)',
  transition: 'all 200ms ease',
}

const hdrBtn = {
  background: 'rgba(255,255,255,0.2)', color: 'white',
  padding: '7px 16px', borderRadius: 10,
  fontWeight: 600, fontSize: '0.82rem',
  textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)',
}
