import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'

const MAPS_KEY = 'AIzaSyATKV3W2gaC31gaDZvAd3M9rmNZk9eapxI'

const ORG_COLORS = {
  'Church':                             '#A855F7',
  'Community Member':                   '#22C55E',
  'Nonprofit':                          '#3B82F6',
  'Feeding San Diego Access Point':     '#E91E63',
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
      borderRadius: 12, fontWeight: 600, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      animation: 'slideInToast 0.3s ease-out',
    }}>
      {msg}
      <style>{`@keyframes slideInToast { from { transform: translateX(120%); opacity:0 } to { transform: translateX(0); opacity:1 } }`}</style>
    </div>
  )
}

export default function PublicFeed() {
  const { session, isAppAdmin, memberships } = useAuth()
  const [posts, setPosts]     = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [reactions, setReactions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('feedReactions') ?? '{}') } catch { return {} }
  })
  const [toast, setToast] = useState('')
  const mapRef    = useRef(null)
  const mapDivRef = useRef(null)
  const markersRef = useRef([])

  useEffect(() => {
    supabase
      .from('posts')
      .select('*, organizations(name)')
      .eq('is_active', true)
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPosts(data ?? [])
        setLoading(false)
      })
    loadMaps()
  }, [])

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
      styles: [
        { featureType: 'all', elementType: 'geometry',           stylers: [{ color: '#242f3e' }] },
        { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
        { featureType: 'all', elementType: 'labels.text.fill',   stylers: [{ color: '#746855' }] },
        { featureType: 'water', elementType: 'geometry',         stylers: [{ color: '#17263c' }] },
      ],
    })
  }

  useEffect(() => {
    if (!mapRef.current || posts.length === 0) return
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    posts.forEach(post => {
      if (!post.latitude || !post.longitude) return
      const marker = new window.google.maps.Marker({
        position: { lat: post.latitude, lng: post.longitude },
        map: mapRef.current,
        title: post.title,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 9, fillOpacity: 0.9,
          fillColor: orgColor(post.organizations?.name),
          strokeColor: '#fff', strokeWeight: 2,
        },
      })
      const iw = new window.google.maps.InfoWindow({
        content: `<div style="font-family:Inter,sans-serif;max-width:230px"><b style="color:${orgColor(post.organizations?.name)}">${post.title}</b><p style="margin:4px 0;font-size:12px;color:#555">${post.organizations?.name ?? ''}</p>${post.address ? `<p style="font-size:12px;margin:0">📍 ${post.address}</p>` : ''}</div>`,
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
      if (next) {
        const post = posts.find(p => p.id === next)
        if (post) panTo(post)
      }
      return next
    })
  }

  function saveReactions(next) {
    setReactions(next)
    localStorage.setItem('feedReactions', JSON.stringify(next))
  }

  function handleThumbsUp(postId) {
    const r = reactions[postId] ?? { thumbsUp: 0, liked: false }
    saveReactions({
      ...reactions,
      [postId]: { ...r, thumbsUp: r.liked ? r.thumbsUp - 1 : r.thumbsUp + 1, liked: !r.liked },
    })
  }

  function handleReport(postId) {
    const r = reactions[postId] ?? { thumbsUp: 0, liked: false, reported: false }
    const next = { ...r, reported: !r.reported }
    saveReactions({ ...reactions, [postId]: next })
    if (next.reported) setToast('⚠️ Post reported — thank you for your feedback.')
  }

  const isAdmin = isAppAdmin || memberships.length > 0

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '1.5rem' }}>
        <div className="page-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', position: 'relative', zIndex: 1 }}>
            <div>
              <h1>East County Food Network</h1>
              <p>Free food resources across San Diego County</p>
            </div>
            <div>
              {isAdmin ? (
                <a href="/admin" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '8px 18px', borderRadius: 20, fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
                  Admin →
                </a>
              ) : session ? (
                <a href="/organization-request" style={{ background: 'rgba(255,255,255,0.15)', color: 'white', padding: '8px 18px', borderRadius: 20, fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>
                  My Request
                </a>
              ) : (
                <a href="/login" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '8px 18px', borderRadius: 20, fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.3)' }}>
                  Provider Login →
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 1.5rem 2rem' }}>
        {/* Map */}
        <div
          ref={mapDivRef}
          style={{ width: '100%', height: 400, borderRadius: 16, marginBottom: '1.5rem', background: 'var(--color-bg-light)', overflow: 'hidden', boxShadow: 'var(--shadow-md)' }}
        />

        {/* Feed */}
        <h2 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          📋 Available Resources
        </h2>

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>Loading resources…</p>
        ) : posts.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>📭 No active posts yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {posts.map(post => {
              const r = reactions[post.id] ?? {}
              const isOpen = expanded === post.id
              const orgName = post.organizations?.name ?? ''
              const color = orgColor(orgName)

              return (
                <article key={post.id} style={{
                  background: 'var(--color-bg-light)', border: `1px solid ${isOpen ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  borderRadius: 16, padding: '1.25rem', transition: 'all 200ms', cursor: 'pointer',
                  boxShadow: isOpen ? 'var(--shadow-lg)' : 'none',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* Color accent bar */}
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: color, opacity: isOpen ? 1 : 0, transition: 'opacity 200ms' }} />

                  {/* Collapsed header — always visible */}
                  <div onClick={() => toggleExpand(post.id)}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{post.organizations?.name ?? 'Anonymous'}</span>
                        <span style={{ padding: '2px 10px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}55` }}>
                          {post.category ?? 'food'}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{timeAgo(post.created_at)}</span>
                    </div>

                    {post.address && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>
                        📍 {post.address}{post.city ? `, ${post.city}` : ''}
                      </p>
                    )}

                    {/* Expanded content */}
                    {isOpen && (
                      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '2px solid var(--color-border)' }}>
                        <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>{post.title}</h3>
                        {post.description && (
                          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: '0.75rem', fontSize: '0.93rem' }}>{post.description}</p>
                        )}
                        {post.image_url && (
                          <img src={post.image_url} alt={post.title} style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10, marginBottom: '0.75rem' }} loading="lazy" />
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem' }}>
                          {post.start_time && (
                            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.875rem' }}>
                              <span style={{ color: 'var(--color-text-muted)', minWidth: 100 }}>🕐 Time:</span>
                              <span style={{ color: 'var(--color-text-primary)' }}>
                                {new Date(post.start_time).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                {post.end_time ? ` – ${new Date(post.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                              </span>
                            </div>
                          )}
                        </div>

                        {post.tags?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.75rem' }}>
                            {post.tags.map(t => (
                              <span key={t} style={{ padding: '3px 12px', background: 'var(--color-surface)', borderRadius: 12, fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Interaction bar — always visible */}
                  <div
                    style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid var(--color-border)' }}
                    onClick={e => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleThumbsUp(post.id)}
                      style={{
                        padding: '5px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', border: '1px solid',
                        background: r.liked ? 'hsla(142,60%,45%,0.2)' : 'var(--color-surface)',
                        color:      r.liked ? 'hsl(142,70%,65%)'     : 'var(--color-text-muted)',
                        borderColor: r.liked ? 'hsla(142,60%,45%,0.5)' : 'var(--color-border)',
                        transition: 'all 150ms',
                      }}
                    >
                      👍 {r.thumbsUp ? r.thumbsUp : ''}
                    </button>

                    <button
                      onClick={() => handleReport(post.id)}
                      style={{
                        padding: '5px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', border: '1px solid',
                        background: r.reported ? 'hsla(0,84%,60%,0.15)' : 'var(--color-surface)',
                        color:      r.reported ? 'hsl(0,84%,70%)'       : 'var(--color-text-muted)',
                        borderColor: r.reported ? 'hsla(0,84%,60%,0.4)' : 'var(--color-border)',
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

        <p style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
          Are you a food provider?{' '}
          <a href="/login" style={{ color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 600 }}>
            Sign in to post resources →
          </a>
        </p>
      </div>

      {toast && <Notification msg={toast} onDone={() => setToast('')} />}
    </div>
  )
}
