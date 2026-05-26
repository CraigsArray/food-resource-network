import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { 'en-US': enUS } })

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

function attachmentType(url) {
  if (!url) return null
  const ext = url.split('?')[0].toLowerCase().split('.').pop()
  if (['jpg','jpeg','png','gif','webp','svg','avif','bmp'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  return 'file'
}

function PostAttachment({ url, title }) {
  const type = attachmentType(url)
  if (!type) return null
  if (type === 'image') {
    return <img src={url} alt={title} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 10, marginBottom: '0.75rem' }} loading="lazy" />
  }
  const filename = decodeURIComponent(url.split('/').pop().split('?')[0]) || 'Attachment'
  const isPdf = type === 'pdf'
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.75rem 1rem', borderRadius: 10, marginBottom: '0.75rem',
      border: `1px solid ${isPdf ? 'hsla(0,70%,55%,0.3)' : 'var(--color-border)'}`,
      background: isPdf ? 'hsla(0,70%,55%,0.06)' : 'var(--color-bg-light)',
      textDecoration: 'none', transition: 'opacity 150ms',
    }} onMouseEnter={e => e.currentTarget.style.opacity = '0.8'} onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
      {isPdf ? (
        <div style={{ width: 38, height: 38, borderRadius: 8, background: '#e53935', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ color: 'white', fontSize: '0.58rem', fontWeight: 900, letterSpacing: '-0.5px' }}>PDF</span>
        </div>
      ) : (
        <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--color-bg-medium)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)' }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</div>
        <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>{isPdf ? 'PDF Document' : 'File'} · Click to open</div>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
    </a>
  )
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
  // Parse key as local time — new Date('YYYY-MM-DD') is UTC and shifts dates in PST
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m, d) // month is already 0-indexed from dateKey()
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
  const [toast, setToast]         = useState('')
  const [activeTab, setActiveTab]   = useState('map')
  const [visibleCount, setVisibleCount] = useState(50)
  const mapRef         = useRef(null)
  const mapDivRef      = useRef(null)
  const markersRef     = useRef([])
  const themeRef       = useRef(theme)
  const pendingScrollRef = useRef(null)

  useEffect(() => { themeRef.current = theme }, [theme])

  useEffect(() => {
    if (!pendingScrollRef.current) return
    const id = pendingScrollRef.current
    pendingScrollRef.current = null
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }, [visibleCount])

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
    const sortedAll = [...posts].filter(p => p.start_time).sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    const noDates = posts.filter(p => !p.start_time)
    const visiblePosts = [...sortedAll, ...noDates].slice(0, visibleCount)
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []
    visiblePosts.forEach(post => {
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
        if (post.start_time) {
          const d = new Date(post.start_time)
          const feedId = `feed-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
          const sortedPosts = [...posts].filter(p => p.start_time)
            .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
          const idx = sortedPosts.findIndex(p => p.id === post.id)
          if (idx !== -1 && idx >= visibleCount) {
            setVisibleCount(idx + 1)
            pendingScrollRef.current = feedId
          } else {
            document.getElementById(feedId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        }
      })
      marker.infoWindow = iw
      markersRef.current.push(marker)
    })
  }, [posts, visibleCount])

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

  function switchTab(tab) {
    setActiveTab(tab)
    if (tab === 'map' && mapRef.current) {
      setTimeout(() => window.google?.maps.event.trigger(mapRef.current, 'resize'), 50)
    }
  }

  function handleCalendarEventClick(event) {
    const d = new Date(event.start)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const feedId = `feed-${key}`
    const postId = event.id
    const sortedPosts = [...posts].filter(p => p.start_time)
      .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    const idx = sortedPosts.findIndex(p => p.id === postId)
    if (idx !== -1 && idx >= visibleCount) {
      setVisibleCount(idx + 1)
      pendingScrollRef.current = feedId
    } else {
      document.getElementById(feedId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
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
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0.875rem 1.5rem', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'stretch', gap: '1rem' }}>

          {/* Left: EC Collab back arrow + logo */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: '0.375rem' }}>
            <a
              href="https://elcajoncollaborative.org"
              title="Return to El Cajon Collaborative"
              style={{ display: 'flex', alignItems: 'center', color: isDark ? 'rgba(255,255,255,0.7)' : 'var(--color-text-muted)', textDecoration: 'none', flexShrink: 0 }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </a>
            <div style={{ width: 1, alignSelf: 'stretch', background: isDark ? 'rgba(255,255,255,0.25)' : 'var(--color-border)', flexShrink: 0 }} />
            <a
              href="https://elcajoncollaborative.org"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}
            >
              <img src="/el-cajob-collab.png" alt="El Cajon Collaborative" style={{ height: '100%', width: 'auto', objectFit: 'contain', maxHeight: 64 }} />
            </a>
          </div>

          {/* Center: title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', textAlign: 'center', alignItems: 'center', justifyContent: 'center' }}>
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
              Local Food Pantries and Distributions in East County, San Diego
            </span>
            <span style={{ fontSize: '0.72rem', color: isDark ? 'rgba(255,255,255,0.6)' : 'var(--color-text-muted)', lineHeight: 1.3 }}>
              Maintained by the El Cajon Collaborative
            </span>
          </div>

          {/* Right: nav */}
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

        {/* Welcome blurb */}
        <div style={{
          marginBottom: '2rem',
          padding: '1.25rem 1.5rem',
          background: 'var(--color-bg-medium)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          lineHeight: 1.65,
        }}>
          <h2 style={{
            fontFamily: 'Outfit, sans-serif', fontWeight: 700,
            fontSize: '1.1rem', color: 'var(--color-text-primary)',
            marginBottom: '0.6rem',
          }}>
            Welcome to the East County Food Network
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', margin: 0 }}>
            This site lists free food resources including food pantries, distributions, and meals
            available throughout El Cajon and the surrounding East County communities.
            Browse upcoming events below, explore the map, or use the calendar to plan ahead.
            All listings are contributed by local organizations and updated regularly.
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginTop: '0.75rem', marginBottom: 0 }}>
            If you don't find what you're looking for here, visit{' '}
            <a href="https://ecassist.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>ECAssist.org</a>{' '}
            for a broader directory of East County resources.
            You can also call <strong>2-1-1</strong> or visit{' '}
            <a href="https://www.211sandiego.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>211sandiego.org</a>{' '}
            for county-wide assistance.
          </p>
        </div>

        {/* Folder tabs + Map/Calendar */}
        <div style={{ marginBottom: '2rem' }}>

          {/* Tab strip */}
          <div style={{ display: 'flex' }}>
            {[{ id: 'map', label: '🗺️  Map' }, { id: 'calendar', label: '📅  Calendar' }].map(tab => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                style={{
                  padding: '0.55rem 1.4rem',
                  fontWeight: activeTab === tab.id ? 700 : 500,
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  border: '1px solid var(--color-border)',
                  borderBottom: activeTab === tab.id ? `1px solid var(--color-bg-medium)` : '1px solid var(--color-border)',
                  borderRadius: '10px 10px 0 0',
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

          {/* Content panel */}
          <div style={{
            border: '1px solid var(--color-border)',
            borderRadius: '0 10px 10px 10px',
            overflow: 'hidden',
            position: 'relative', zIndex: 0,
            boxShadow: 'var(--shadow-md)',
          }}>
            {/* Map — always mounted so Google Maps state is preserved */}
            <div
              ref={mapDivRef}
              style={{
                width: '100%', height: 400,
                background: 'var(--color-bg-light)',
                display: activeTab === 'map' ? 'block' : 'none',
              }}
            />

            {/* Calendar */}
            {activeTab === 'calendar' && (
              <div style={{ height: 560, background: 'var(--color-bg-medium)', padding: '0.75rem' }}>
                <style>{`
                  .rbc-calendar { font-family: Inter, sans-serif; color: var(--color-text-primary); }
                  .rbc-toolbar { display: flex; flex-wrap: nowrap; align-items: center; gap: 0.25rem; margin-bottom: 6px; }
                  .rbc-toolbar .rbc-btn-group { display: flex; flex-wrap: nowrap; gap: 2px; }
                  .rbc-toolbar button { color: var(--color-text-secondary); border-color: var(--color-border); background: var(--color-bg-dark); border-radius: 8px; font-size: 0.78rem; padding: 3px 10px; white-space: nowrap; }
                  .rbc-toolbar button:hover, .rbc-toolbar button.rbc-active { background: var(--color-primary); color: white; border-color: var(--color-primary); }
                  .rbc-toolbar-label { flex: 1; font-weight: 700; color: var(--color-text-primary); text-align: center; white-space: nowrap; }
                  .rbc-header { background: var(--color-bg-dark); color: var(--color-text-secondary); border-color: var(--color-border); font-size: 0.78rem; padding: 4px 0; }
                  .rbc-month-view, .rbc-agenda-view table { border-color: var(--color-border); }
                  .rbc-day-bg { background: var(--color-bg-medium); }
                  .rbc-off-range-bg { background: var(--color-bg-dark); opacity: 0.6; }
                  .rbc-today { background: hsla(28,95%,55%,0.08) !important; }
                  .rbc-event { background: var(--color-primary); border-radius: 4px; font-size: 0.72rem; border: none; padding: 1px 4px; }
                  .rbc-show-more { color: var(--color-primary); font-size: 0.72rem; }
                  .rbc-date-cell { color: var(--color-text-secondary); font-size: 0.78rem; padding: 2px 4px; }
                  .rbc-date-cell.rbc-now { color: var(--color-primary); font-weight: 700; }
                  .rbc-agenda-date-cell, .rbc-agenda-time-cell { color: var(--color-text-secondary); font-size: 0.82rem; }
                  .rbc-agenda-event-cell { color: var(--color-text-primary); font-size: 0.82rem; }
                  .rbc-row-segment .rbc-event-content { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                  .rbc-month-row { min-height: 60px; }
                `}</style>
                <Calendar
                  localizer={localizer}
                  events={posts.filter(p => p.start_time).map(p => ({
                    id:       p.id,
                    title:    p.title,
                    start:    new Date(p.start_time),
                    end:      p.end_time ? new Date(p.end_time) : new Date(p.start_time),
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
        <h2 style={{
          fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: 700,
          marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
          color: 'var(--color-text-primary)',
        }}>
          Upcoming Events, Sorted by Date
        </h2>

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>Loading resources…</p>
        ) : posts.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>📭 No active posts yet.</p>
        ) : (() => {
          const sortedPosts = [...posts].filter(p => p.start_time).sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
          const noDates = posts.filter(p => !p.start_time)
          const allOrdered = [...sortedPosts, ...noDates]
          const visiblePosts = allOrdered.slice(0, visibleCount)
          const remaining = allOrdered.length - visiblePosts.length
          return (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {groupPostsByDate(visiblePosts).map(({ key, label, isToday, posts: group }, gi) => (
              <div key={key} id={`feed-${key}`}>
                {/* Date section header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  marginTop: gi === 0 ? 0 : '1.75rem', marginBottom: '0.75rem',
                }}>
                  <span style={{
                    fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap',
                    color: isToday ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                    background: isToday ? 'hsla(28,95%,55%,0.1)' : 'var(--color-bg-medium)',
                    border: `1px solid ${isToday ? 'hsla(28,95%,55%,0.35)' : 'var(--color-border)'}`,
                    padding: '3px 14px', borderRadius: 20,
                  }}>
                    {label}
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                </div>

                {/* Posts in this group */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {group.map(post => {
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

                          {/* Title — large, first */}
                          <p style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--color-text-primary)', marginBottom: '0.3rem', lineHeight: 1.3 }}>
                            {post.title}
                          </p>

                          {/* Date/time — prominent, below title */}
                          {post.start_time && (
                            <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '0.4rem' }}>
                              🕐 {new Date(post.start_time).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}
                              {post.end_time ? ` – ${new Date(post.end_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                            </p>
                          )}

                          {/* Provider + category + time ago */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: post.address ? '0.3rem' : 0 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                              {orgName || 'Anonymous'}
                            </span>
                            <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44` }}>
                              {post.category ?? 'food'}
                            </span>
                            {post.start_time && (
                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                                {new Date(post.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>

                          {/* Address */}
                          {post.address && (
                            <p style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)' }}>
                              📍 {post.address}{post.city ? `, ${post.city}` : ''}
                            </p>
                          )}

                          {/* Expanded content */}
                          {isOpen && (
                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `1px solid var(--color-border)` }}>
                              {post.description && (
                                <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: '0.75rem', fontSize: '0.9rem' }}>{post.description}</p>
                              )}
                              <PostAttachment url={post.image_url} title={post.title} />
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
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            onClick={() => handleThumbsUp(post.id)}
                            style={{
                              padding: '4px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', border: '1px solid',
                              background:  r.liked ? 'hsla(142,60%,45%,0.15)' : 'var(--color-surface)',
                              color:       r.liked ? 'var(--color-success)'    : 'var(--color-text-muted)',
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
                              background:  r.reported ? 'hsla(0,84%,60%,0.12)'  : 'var(--color-surface)',
                              color:       r.reported ? 'var(--color-error)'     : 'var(--color-text-muted)',
                              borderColor: r.reported ? 'hsla(0,84%,60%,0.35)'  : 'var(--color-border)',
                              transition: 'all 150ms',
                            }}
                            title={r.reported ? 'Reported' : 'Report this post'}
                          >
                            {r.reported ? '⚠️ Reported' : '!'}
                          </button>
                          {post.address && (
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([post.address, post.city, post.zip].filter(Boolean).join(', '))}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                marginLeft: 'auto', padding: '4px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600,
                                border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                                color: 'var(--color-text-muted)', textDecoration: 'none', transition: 'all 150ms',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'var(--color-primary)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-surface)'; e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
                            >
                              🗺️ Directions
                            </a>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
            ))}
            {remaining > 0 && (
              <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                <button
                  onClick={() => setVisibleCount(c => c + 50)}
                  style={{
                    padding: '0.7rem 2rem', borderRadius: 24, fontSize: '0.9rem', fontWeight: 700,
                    background: 'var(--color-bg-medium)', color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)', cursor: 'pointer',
                    transition: 'all 150ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-primary)'; e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'var(--color-primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-bg-medium)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--color-border)' }}
                >
                  Show {remaining} more event{remaining !== 1 ? 's' : ''} ↓
                </button>
              </div>
            )}
          </div>
          )
        })()}

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

function CalendarEvent({ event }) {
  const post = event.resource
  return (
    <div style={{ lineHeight: 1.3, overflow: 'hidden' }}>
      <div style={{ fontWeight: 600, fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {event.title}
      </div>
      {post?.address && (
        <div style={{ fontSize: '0.67rem', opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          📍 {post.address}
        </div>
      )}
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
