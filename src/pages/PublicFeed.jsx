import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

const DARK_MAP_STYLES = [
  { featureType: 'all', elementType: 'geometry',           stylers: [{ color: '#242f3e' }] },
  { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { featureType: 'all', elementType: 'labels.text.fill',   stylers: [{ color: '#746855' }] },
  { featureType: 'water', elementType: 'geometry',         stylers: [{ color: '#17263c' }] },
]

const ORG_COLORS = {
  'Church':                           '#A855F7',
  'Community Member':                 '#22C55E',
  'Nonprofit':                        '#3B82F6',
  'Feeding San Diego Access Point':   '#E91E63',
}

function orgColor(name) { return ORG_COLORS[name] ?? '#22C55E' }

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

function Notification({ msg, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2800)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: 'var(--color-success)', color: 'white', padding: '14px 22px',
      borderRadius: 12, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      animation: 'slideInToast 0.3s ease-out',
    }}>
      {msg}
      <style>{`@keyframes slideInToast { from { transform: translateX(120%); opacity:0 } to { transform: translateX(0); opacity:1 } }`}</style>
    </div>
  )
}

export default function PublicFeed() {
  const { session, isAppAdmin, memberships } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [posts, setPosts]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [reactions, setReactions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('feedReactions') ?? '{}') } catch { return {} }
  })
  const [toast, setToast] = useState('')
  const mapRef     = useRef(null)
  const mapDivRef  = useRef(null)
  const markersRef = useRef([])
  const themeRef   = useRef(theme)

  useEffect(() => { themeRef.current = theme }, [theme])

  useEffect(() => {
    supabase
      .from('posts')
      .select('*, organizations(name)')
      .eq('is_active', true)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setPosts(data ?? []); setLoading(false) })
    loadMaps()
  }, [])

  // Update map style when theme toggles
  useEffect(() => {
    if (!mapRef.current) return
    mapRef.current.setOptions({ styles: theme === 'dark' ? DARK_MAP_STYLES : [] })
  }, [theme])

  function loadMaps() {
    if (window.google?.maps) { initMap(); return }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&callback=__initPublicMap`
    s.async = true
    window.__initPublicMap = initMap
    document.head.appendChild(s)
  }

  function initMap() {
    if (!mapDivRef.current) return
    mapRef.current = new window.google.maps.Map(mapDivRef.current, {
      center: { lat: 32.7157, lng: -117.1611 },
      zoom: 10,
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
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 9, fillOpacity: 0.9,
          fillColor: color,
          strokeColor: '#fff', strokeWeight: 2,
        },
      })
      const iw = new window.google.maps.InfoWindow({
        content: `<div style="font-family:Inter,sans-serif;max-width:230px"><b style="color:${color}">${post.title}</b><p style="margin:4px 0;font-size:12px;color:#555">${post.organizations?.name ?? ''}</p>${post.address ? `<p style="font-size:12px;margin:0">📍 ${post.address}</p>` : ''}</div>`,
      })
      marker.addListener('click', () => {
        markersRef.current.forEach(m => m.infoWindow?.close())
        iw.open(mapRef.current, marker)
      })
      marker.infoWindow = iw
      markersRef.current.push(marker)
    })
  }, [posts])

  function panTo(post) {
    if (!mapRef.current || !post.latitude || !post.longitude) return
    mapRef.current.panTo({ lat: post.latitude, lng: post.longitude })
    mapRef.current.setZoom(15)
    const marker = markersRef.current.find(m => m.getTitle() === post.title)
    if (marker?.infoWindow) {
      markersRef.current.forEach(m => m.infoWindow?.close())
      marker.infoWindow.open(mapRef.current, marker)
    }
  }

  function toggleExpand(id) {
    setExpanded(cur => {
      const next = cur === id ? null : id
      if (next) { const post = posts.find(p => p.id === next); if (post) panTo(post) }
      return next
    })
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
    const next = { ...r, reported: !r.reported }
    saveReactions({ ...reactions, [postId]: next })
    if (next.reported) setToast('⚠️ Post reported — thank you for your feedback.')
  }

  const isAdmin = isAppAdmin || memberships.length > 0
  const isDark  = theme === 'dark'

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-dark)', transition: 'background 200ms ease' }}>

      {/* Header — same height in both modes, colors flip */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: isDark
          ? 'linear-gradient(135deg, hsl(28,95%,55%) 0%, hsl(340,82%,52%) 100%)'
          : 'var(--color-bg-dark)',
        borderBottom: isDark ? 'none' : '1px solid var(--color-border)',
        boxShadow: isDark ? '0 2px 16px rgba(0,0,0,0.28)' : '0 1px 6px rgba(0,0,0,0.06)',
        transition: 'background 200ms ease, box-shadow 200ms ease',
      }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>

          {/* Left: title + subtitles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <span style={{
              fontFamily: 'Outfit, sans-serif', fontWeight: 800,
              fontSize: 'clamp(1.15rem, 3vw, 1.5rem)', lineHeight: 1.2,
              ...(isDark
                ? { color: 'white' }
                : { background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
              ),
            }}>
              East County Food Network
            </span>
            <span style={{ fontSize: '0.78rem', color: isDark ? 'rgba(255,255,255,0.85)' : 'var(--color-text-secondary)', lineHeight: 1.3 }}>
              Aggregated food pantries &amp; distributions in East County
            </span>
            <span style={{ fontSize: '0.72rem', color: isDark ? 'rgba(255,255,255,0.6)' : 'var(--color-text-muted)', lineHeight: 1.3 }}>
              Maintained by the <strong style={{ color: isDark ? 'rgba(255,255,255,0.85)' : 'var(--color-text-secondary)', fontWeight: 600 }}>El Cajon Collaborative</strong>
            </span>
          </div>

          {/* Right: nav only */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
            {isAdmin ? (
              <a href="/admin" style={isDark ? darkHeaderLinkStyle : lightHeaderLinkStyle}>Admin →</a>
            ) : session ? (
              <a href="/organization-request" style={isDark ? darkHeaderLinkStyle : lightHeaderLinkStyle}>My Request</a>
            ) : (
              <a href="/login" style={isDark ? darkHeaderLinkStyle : lightHeaderLinkStyle}>Provider Login →</a>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem' }}>

        {/* Map */}
        <div
          ref={mapDivRef}
          style={{
            width: '100%', height: 380, borderRadius: 16, marginBottom: '2rem',
            background: 'var(--color-bg-light)', overflow: 'hidden',
            boxShadow: 'var(--shadow-md)',
            border: '1px solid var(--color-border)',
          }}
        />

        {/* Feed */}
        <h2 style={{
          fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: 700,
          marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
          color: 'var(--color-text-primary)',
        }}>
          📋 Available Resources
        </h2>

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>Loading resources…</p>
        ) : posts.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>📭 No active posts yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {posts.map(post => {
              const r = reactions[post.id] ?? {}
              const isOpen = expanded === post.id
              const orgName = post.organizations?.name ?? ''
              const color = orgColor(orgName)

              return (
                <article key={post.id} style={{
                  background: 'var(--color-bg-medium)',
                  border: `1px solid ${isOpen ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  borderRadius: 14, padding: '1.125rem 1.25rem',
                  transition: 'all 180ms', cursor: 'pointer',
                  boxShadow: isOpen ? 'var(--shadow-md)' : 'var(--shadow-sm)',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* Color accent bar */}
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: color, opacity: isOpen ? 1 : 0, transition: 'opacity 200ms', borderRadius: '14px 0 0 14px' }} />

                  <div onClick={() => toggleExpand(post.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-text-primary)' }}>
                          {post.organizations?.name ?? 'Anonymous'}
                        </span>
                        <span style={{ padding: '2px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}55` }}>
                          {post.category ?? 'food'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{timeAgo(post.created_at)}</span>
                    </div>

                    <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text-primary)', marginBottom: '0.25rem' }}>{post.title}</p>

                    {post.address && (
                      <p style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)' }}>
                        📍 {post.address}{post.city ? `, ${post.city}` : ''}
                      </p>
                    )}

                    {isOpen && (
                      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `1px solid var(--color-border)` }}>
                        {post.description && (
                          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: '0.75rem', fontSize: '0.9rem' }}>{post.description}</p>
                        )}
                        {post.image_url && (
                          <img src={post.image_url} alt={post.title} style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, marginBottom: '0.75rem' }} loading="lazy" />
                        )}
                        {post.start_time && (
                          <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                            <span style={{ color: 'var(--color-text-muted)', minWidth: 80 }}>🕐 Time:</span>
                            <span style={{ color: 'var(--color-text-primary)' }}>
                              {new Date(post.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              {post.end_time ? ` – ${new Date(post.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                            </span>
                          </div>
                        )}
                        {post.tags?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem' }}>
                            {post.tags.map(t => (
                              <span key={t} style={{ padding: '3px 12px', background: 'var(--color-surface)', borderRadius: 12, fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Reaction bar */}
                  <div
                    style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleThumbsUp(post.id)}
                      style={{
                        padding: '4px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', border: '1px solid',
                        background: r.liked ? 'hsla(142,60%,45%,0.15)' : 'var(--color-surface)',
                        color:      r.liked ? 'var(--color-success)'    : 'var(--color-text-muted)',
                        borderColor: r.liked ? 'hsla(142,60%,45%,0.4)'  : 'var(--color-border)',
                        transition: 'all 150ms',
                      }}
                    >
                      👍 {r.thumbsUp || ''}
                    </button>
                    <button
                      onClick={() => handleReport(post.id)}
                      style={{
                        padding: '4px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', border: '1px solid',
                        background: r.reported ? 'hsla(0,84%,60%,0.12)'  : 'var(--color-surface)',
                        color:      r.reported ? 'var(--color-error)'     : 'var(--color-text-muted)',
                        borderColor: r.reported ? 'hsla(0,84%,60%,0.35)' : 'var(--color-border)',
                        transition: 'all 150ms',
                      }}
                      title={r.reported ? 'Reported' : 'Report this post'}
                    >
                      {r.reported ? '⚠️ Reported' : '!'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        <p style={{ marginTop: '2.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)', paddingBottom: '1rem' }}>
          Are you a food provider?{' '}
          <a href="/login" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>
            Sign in to post resources →
          </a>
        </p>
      </div>

      {/* Floating theme toggle */}
      <button
        onClick={toggleTheme}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 200,
          width: 48, height: 48, borderRadius: '50%',
          background: isDark ? 'rgba(255,255,255,0.15)' : 'white',
          border: isDark ? '1px solid rgba(255,255,255,0.25)' : '1px solid var(--color-border)',
          boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.12)',
          fontSize: '1.25rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 200ms ease',
          backdropFilter: 'blur(8px)',
        }}
      >
        {isDark ? '☀️' : '🌙'}
      </button>

      {toast && <Notification msg={toast} onDone={() => setToast('')} />}
    </div>
  )
}

const darkHeaderLinkStyle = {
  background: 'rgba(255,255,255,0.2)',
  color: 'white',
  padding: '7px 18px',
  borderRadius: 20,
  fontWeight: 700,
  fontSize: '0.85rem',
  textDecoration: 'none',
  border: '1px solid rgba(255,255,255,0.3)',
}


const lightHeaderLinkStyle = {
  background: 'linear-gradient(135deg, hsl(28,95%,55%), hsl(340,82%,52%))',
  color: 'white',
  padding: '7px 18px',
  borderRadius: 20,
  fontWeight: 700,
  fontSize: '0.85rem',
  textDecoration: 'none',
}
