import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useTheme } from '../contexts/ThemeContext'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { 'en-US': enUS } })

const DARK_MAP_STYLES = [
  { featureType: 'all', elementType: 'geometry',           stylers: [{ color: '#242f3e' }] },
  { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { featureType: 'all', elementType: 'labels.text.fill',   stylers: [{ color: '#746855' }] },
  { featureType: 'water', elementType: 'geometry',         stylers: [{ color: '#17263c' }] },
]

const CATEGORIES = [
  { value: 'food-pantry',       label: 'Food Pantry' },
  { value: 'food-distribution', label: 'Food Distribution' },
  { value: 'meal',              label: 'Meal' },
]

function orgColor(name) {
  const map = { 'Church': '#A855F7', 'Community Member': '#22C55E', 'Nonprofit': '#3B82F6', 'Feeding San Diego Access Point': '#E91E63' }
  return map[name] ?? '#22C55E'
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7)  return `${d} days ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dateKey(post) {
  if (!post.start_time) return 'no-date'
  const d = new Date(post.start_time)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m, d)
}

function dateLabel(key) {
  if (key === 'no-date') return 'Ongoing'
  const date     = keyToDate(key)
  const today    = new Date()
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1)
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  const fmt = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  if (same(date, today))    return `Today - ${fmt}`
  if (same(date, tomorrow)) return `Tomorrow - ${fmt}`
  return `${date.toLocaleDateString('en-US', { weekday: 'long' })} - ${fmt}`
}

function groupPostsByDate(posts) {
  const map = new Map()
  const order = []
  for (const post of posts) {
    const k = dateKey(post)
    if (!map.has(k)) { map.set(k, []); order.push(k) }
    map.get(k).push(post)
  }
  const today = new Date()
  return order.map(k => {
    let isToday = false
    if (k !== 'no-date') {
      const d = keyToDate(k)
      isToday = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
    }
    return { key: k, label: dateLabel(k), isToday, posts: map.get(k) }
  })
}

function CalendarEvent({ event }) {
  const post = event.resource
  return (
    <div style={{ lineHeight: 1.3, overflow: 'hidden' }}>
      <div style={{ fontWeight: 600, fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</div>
      {post?.address && (
        <div style={{ fontSize: '0.67rem', opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📍 {post.address}</div>
      )}
    </div>
  )
}

export default function IframeFeed() {
  const { theme, toggleTheme } = useTheme()
  const [posts, setPosts]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState(null)
  const [activeTab, setActiveTab] = useState('map')
  const [reactions, setReactions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('feedReactions') ?? '{}') } catch { return {} }
  })

  const mapRef    = useRef(null)
  const mapDivRef = useRef(null)
  const markersRef = useRef([])
  const themeRef  = useRef(theme)

  const isDark = theme === 'dark'

  useEffect(() => { themeRef.current = theme }, [theme])

  useEffect(() => {
    supabase
      .from('posts')
      .select('*, organizations(name)')
      .eq('is_active', true)
      .eq('status', 'published')
      .order('start_time', { ascending: true, nullsFirst: false })
      .then(({ data }) => { setPosts(data ?? []); setLoading(false) })
    loadMaps()
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.setOptions({ styles: theme === 'dark' ? DARK_MAP_STYLES : [] })
  }, [theme])

  function loadMaps() {
    if (window.google?.maps) { initMap(); return }
    if (document.querySelector('script[data-map-loader]')) return
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&callback=__initIframeMap`
    s.async = true
    s.dataset.mapLoader = true
    window.__initIframeMap = initMap
    document.head.appendChild(s)
  }

  function initMap() {
    if (!mapDivRef.current) return
    mapRef.current = new window.google.maps.Map(mapDivRef.current, {
      center: { lat: 32.7957, lng: -116.9625 },
      zoom: 11,
      styles: themeRef.current === 'dark' ? DARK_MAP_STYLES : [],
    })
  }

  useEffect(() => {
    if (!mapRef.current || posts.length === 0) return
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    posts.forEach(post => {
      if (!post.latitude || !post.longitude) return
      const color = orgColor(post.organizations?.name)
      const marker = new window.google.maps.Marker({
        position: { lat: post.latitude, lng: post.longitude },
        map: mapRef.current,
        title: post.title,
        icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 8, fillOpacity: 0.9, fillColor: color, strokeColor: '#fff', strokeWeight: 2 },
      })
      const iw = new window.google.maps.InfoWindow({
        content: `<div style="font-family:Inter,sans-serif;max-width:200px"><b style="color:${color}">${post.title}</b><p style="margin:4px 0;font-size:12px;color:#555">${post.organizations?.name ?? ''}</p>${post.address ? `<p style="font-size:12px;margin:0">📍 ${post.address}</p>` : ''}</div>`,
      })
      marker.addListener('click', () => { markersRef.current.forEach(m => m.infoWindow?.close()); iw.open(mapRef.current, marker) })
      marker.infoWindow = iw
      markersRef.current.push(marker)
    })
  }, [posts])

  function switchTab(tab) {
    setActiveTab(tab)
    if (tab === 'map' && mapRef.current) {
      setTimeout(() => window.google?.maps.event.trigger(mapRef.current, 'resize'), 50)
    }
  }

  function handleCalendarEventClick(event) {
    const d = new Date(event.start)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    document.getElementById(`iframe-feed-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function saveReactions(next) {
    setReactions(next)
    localStorage.setItem('feedReactions', JSON.stringify(next))
  }

  function handleThumbsUp(postId) {
    const r = reactions[postId] ?? { thumbsUp: 0, liked: false }
    saveReactions({ ...reactions, [postId]: { ...r, thumbsUp: r.liked ? r.thumbsUp - 1 : r.thumbsUp + 1, liked: !r.liked } })
  }

  function handleReport(postId) {
    const r = reactions[postId] ?? { thumbsUp: 0, liked: false, reported: false }
    saveReactions({ ...reactions, [postId]: { ...r, reported: !r.reported } })
  }

  function toggleExpand(id) {
    setExpanded(cur => cur === id ? null : id)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-dark)', transition: 'background 200ms ease', fontFamily: 'Inter, sans-serif' }}>

      {/* Header — not sticky, scrolls with content */}
      <header style={{
        background: isDark
          ? 'linear-gradient(135deg, hsl(28,95%,55%) 0%, hsl(340,82%,52%) 100%)'
          : 'var(--color-bg-dark)',
        borderBottom: isDark ? 'none' : '1px solid var(--color-border)',
        boxShadow: isDark ? '0 2px 12px rgba(0,0,0,0.2)' : '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <span style={{
              fontFamily: 'Outfit, sans-serif', fontWeight: 800,
              fontSize: 'clamp(1rem, 3vw, 1.3rem)', lineHeight: 1.2,
              ...(isDark
                ? { color: 'white' }
                : { background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
              ),
            }}>
              East County Food Network
            </span>
            <span style={{ fontSize: '0.73rem', color: isDark ? 'rgba(255,255,255,0.8)' : 'var(--color-text-secondary)', lineHeight: 1.3 }}>
              Aggregated food pantries &amp; distributions in East County
            </span>
          </div>

          <a
            href={window.location.origin}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: '6px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 700,
              textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              ...(isDark
                ? { background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)' }
                : { background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))', color: 'white', border: 'none' }
              ),
            }}
          >
            Visit Site →
          </a>
        </div>
      </header>

      {/* EC Collab branding bar — below header, not fixed */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.4rem 1.25rem',
        background: isDark ? 'rgba(0,0,0,0.2)' : 'var(--color-bg-medium)',
        borderBottom: `1px solid var(--color-border)`,
      }}>
        <a
          href="https://elcajoncollaborative.org"
          title="Return to El Cajon Collaborative"
          style={{ display: 'flex', alignItems: 'center', color: isDark ? 'rgba(255,255,255,0.6)' : 'var(--color-text-muted)', textDecoration: 'none', flexShrink: 0 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </a>
        <div style={{ width: 1, height: 14, background: isDark ? 'rgba(255,255,255,0.15)' : 'var(--color-border)', flexShrink: 0 }} />
        <a
          href="https://elcajoncollaborative.org"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}
        >
          <img src="/el-cajob-collab.png" alt="El Cajon Collaborative" style={{ height: 18, width: 'auto', objectFit: 'contain' }} />
          <span style={{ fontSize: '0.68rem', fontWeight: 500, color: isDark ? 'rgba(255,255,255,0.6)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
            Maintained by the El Cajon Collaborative
          </span>
        </a>
      </div>

      {/* Content */}
      <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        {/* Folder tabs + Map/Calendar */}
        <div>
          <div style={{ display: 'flex' }}>
            {[{ id: 'map', label: '🗺️  Map' }, { id: 'calendar', label: '📅  Calendar' }].map(tab => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                style={{
                  padding: '0.45rem 1.1rem',
                  fontWeight: activeTab === tab.id ? 700 : 500,
                  fontSize: '0.82rem', cursor: 'pointer',
                  border: '1px solid var(--color-border)',
                  borderBottom: activeTab === tab.id ? `1px solid var(--color-bg-medium)` : '1px solid var(--color-border)',
                  borderRadius: '8px 8px 0 0',
                  marginBottom: activeTab === tab.id ? -1 : 0,
                  marginRight: 4,
                  background: activeTab === tab.id ? 'var(--color-bg-medium)' : 'var(--color-bg-dark)',
                  color: activeTab === tab.id ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  position: 'relative', zIndex: activeTab === tab.id ? 1 : 0,
                  transition: 'all 150ms',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ border: '1px solid var(--color-border)', borderRadius: '0 8px 8px 8px', overflow: 'hidden', position: 'relative', zIndex: 0 }}>
            <div ref={mapDivRef} style={{ width: '100%', height: 280, background: 'var(--color-bg-light)', display: activeTab === 'map' ? 'block' : 'none' }} />

            {activeTab === 'calendar' && (
              <div style={{ height: 480, background: 'var(--color-bg-medium)', padding: '0.4rem' }}>
                <style>{`
                  .rbc-calendar { font-family: Inter, sans-serif; color: var(--color-text-primary); }
                  .rbc-toolbar { display: flex; flex-wrap: nowrap; align-items: center; gap: 0.25rem; margin-bottom: 4px; min-height: 0; }
                  .rbc-toolbar .rbc-btn-group { display: flex; flex-wrap: nowrap; gap: 2px; }
                  .rbc-toolbar button { color: var(--color-text-secondary); border-color: var(--color-border); background: var(--color-bg-dark); border-radius: 5px; font-size: 0.68rem; padding: 2px 7px; white-space: nowrap; }
                  .rbc-toolbar button:hover, .rbc-toolbar button.rbc-active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
                  .rbc-toolbar-label { flex: 1; font-weight: 700; color: var(--color-text-primary); font-size: 0.8rem; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                  .rbc-header { background: var(--color-bg-dark); color: var(--color-text-secondary); border-color: var(--color-border); font-size: 0.7rem; padding: 2px 0; }
                  .rbc-month-view, .rbc-agenda-view table { border-color: var(--color-border); }
                  .rbc-day-bg { background: var(--color-bg-medium); }
                  .rbc-off-range-bg { background: var(--color-bg-dark); opacity: 0.6; }
                  .rbc-today { background: hsla(28,95%,55%,0.08) !important; }
                  .rbc-event { background: var(--color-primary); border-radius: 3px; font-size: 0.7rem; border: none; padding: 1px 3px; }
                  .rbc-show-more { color: var(--color-primary); font-size: 0.68rem; }
                  .rbc-date-cell { color: var(--color-text-secondary); font-size: 0.72rem; padding: 1px 3px; }
                  .rbc-date-cell.rbc-now { color: var(--color-primary); font-weight: 700; }
                  .rbc-row-segment { padding: 0 1px; }
                  .rbc-month-row { min-height: 52px; }
                `}</style>
                <Calendar
                  localizer={localizer}
                  events={posts.filter(p => p.start_time).map(p => ({
                    id: p.id, title: p.title,
                    start: new Date(p.start_time),
                    end: p.end_time ? new Date(p.end_time) : new Date(p.start_time),
                    resource: p,
                  }))}
                  defaultView="month"
                  views={['month', 'agenda']}
                  style={{ height: '100%' }}
                  onSelectEvent={handleCalendarEventClick}
                  components={{ event: CalendarEvent }}
                  popup
                />
              </div>
            )}
          </div>
        </div>

        {/* Feed */}
        <div>
          <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.875rem', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            📋 Available Resources
          </h2>

          {loading ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>Loading resources…</p>
          ) : posts.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>📭 No active posts yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {groupPostsByDate(posts).map(({ key, label, isToday, posts: group }, gi) => (
                <div key={key} id={`iframe-feed-${key}`}>
                  {/* Date header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginTop: gi === 0 ? 0 : '1.375rem', marginBottom: '0.625rem' }}>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap',
                      color: isToday ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                      background: isToday ? 'hsla(28,95%,55%,0.1)' : 'var(--color-bg-medium)',
                      border: `1px solid ${isToday ? 'hsla(28,95%,55%,0.35)' : 'var(--color-border)'}`,
                      padding: '2px 12px', borderRadius: 20,
                    }}>
                      {label}
                    </span>
                    <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  </div>

                  {/* Posts */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {group.map(post => {
                      const r = reactions[post.id] ?? {}
                      const isOpen = expanded === post.id
                      const orgName = post.organizations?.name ?? ''
                      const color = orgColor(orgName)
                      const cat = CATEGORIES.find(c => c.value === post.category)

                      return (
                        <article key={post.id} style={{
                          background: 'var(--color-bg-medium)',
                          border: `1px solid ${isOpen ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          borderRadius: 12, padding: '0.875rem 1rem',
                          transition: 'all 180ms', cursor: 'pointer',
                          boxShadow: isOpen ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                          position: 'relative', overflow: 'hidden',
                        }}>
                          <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: '100%', background: color, opacity: isOpen ? 1 : 0, transition: 'opacity 200ms', borderRadius: '12px 0 0 12px' }} />

                          <div onClick={() => toggleExpand(post.id)}>
                            <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)', marginBottom: '0.25rem', lineHeight: 1.3 }}>
                              {post.title}
                            </p>

                            {post.start_time && (
                              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '0.3rem' }}>
                                🕐 {new Date(post.start_time).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                {post.end_time ? ` – ${new Date(post.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                              </p>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginBottom: post.address ? '0.25rem' : 0 }}>
                              <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{orgName || 'Anonymous'}</span>
                              <span style={{ padding: '1px 7px', borderRadius: 5, fontSize: '0.65rem', fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44` }}>
                                {cat?.label ?? post.category}
                              </span>
                              {post.start_time && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                                  {new Date(post.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </div>

                            {post.address && (
                              <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                                📍 {post.address}{post.city ? `, ${post.city}` : ''}
                              </p>
                            )}

                            {isOpen && (
                              <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid var(--color-border)' }}>
                                {post.description && (
                                  <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.65, marginBottom: '0.625rem', fontSize: '0.875rem' }}>{post.description}</p>
                                )}
                                {post.image_url && (
                                  <img src={post.image_url} alt={post.title} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8, marginBottom: '0.625rem' }} loading="lazy" />
                                )}
                                {post.tags?.length > 0 && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.375rem' }}>
                                    {post.tags.map(t => (
                                      <span key={t} style={{ padding: '2px 10px', background: 'var(--color-surface)', borderRadius: 12, fontSize: '0.7rem', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>{t}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Reactions */}
                          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.625rem', paddingTop: '0.625rem', borderTop: '1px solid var(--color-border)' }}
                            onClick={e => e.stopPropagation()}>
                            <button onClick={() => handleThumbsUp(post.id)} style={{
                              padding: '3px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: '1px solid',
                              background:  r.liked ? 'hsla(142,60%,45%,0.15)' : 'var(--color-surface)',
                              color:       r.liked ? 'var(--color-success)'    : 'var(--color-text-muted)',
                              borderColor: r.liked ? 'hsla(142,60%,45%,0.4)'  : 'var(--color-border)',
                            }}>
                              👍 {r.thumbsUp || ''}
                            </button>
                            <button onClick={() => handleReport(post.id)} style={{
                              padding: '3px 12px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', border: '1px solid',
                              background:  r.reported ? 'hsla(0,84%,60%,0.12)' : 'var(--color-surface)',
                              color:       r.reported ? 'var(--color-error)'    : 'var(--color-text-muted)',
                              borderColor: r.reported ? 'hsla(0,84%,60%,0.35)' : 'var(--color-border)',
                            }} title={r.reported ? 'Reported' : 'Report this post'}>
                              {r.reported ? '⚠️ Reported' : '!'}
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)', paddingBottom: '0.5rem' }}>
          Are you a food provider?{' '}
          <a href={`${window.location.origin}/login`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>
            Sign in to post resources →
          </a>
        </p>
      </div>

    </div>
  )
}
