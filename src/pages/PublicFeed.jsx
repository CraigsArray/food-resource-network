import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

// react-big-calendar is ~200 KB — only load it when the Calendar tab is first opened
const CalendarPanel = lazy(() => import('../components/CalendarPanel'))

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
    const PARTNER_LOGOS = [
      'https://www.vikingcold.com/wp-content/uploads/2019/11/san-diego-food-bank.png',
      'https://feedingsandiego.org/wp-content/uploads/2021/03/Feeding-San-Diego-Logo-Color.png',
    ]
    const imgWidth = PARTNER_LOGOS.includes(url) ? '50%' : '100%'
    return <img src={url} alt={title} style={{ width: imgWidth, height: 'auto', display: 'block', borderRadius: 10, marginBottom: '0.75rem' }} loading="lazy" />
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

// Treats stored timestamps as "naive" local times — the admin form saves bare
// datetime strings (e.g. "2026-07-29T11:30") which Supabase stores as UTC (+00).
// Using new Date() applies a timezone offset, making PDT events display 7 h early.
// Parsing directly from the raw string bypasses that conversion.
function fmtTime(ts) {
  if (!ts) return ''
  const raw = ts.slice(11, 16) // "HH:MM"
  const [h, m] = raw.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return ''
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function fmtDateShort(ts) {
  if (!ts) return ''
  const [y, mo, d] = ts.slice(0, 10).split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Parses a stored timestamp as PST — admin saves bare datetimes which Supabase
// appends +00 to. Slicing off the suffix and parsing without TZ forces local time.
function parseNaiveDate(ts) {
  if (!ts) return null
  return new Date(ts.slice(0, 16).replace(' ', 'T'))
}

function dateKey(post) {
  if (!post.start_time) return 'no-date'
  // Parse date directly from string — avoids timezone shift (see fmtTime comment)
  const [y, mo, d] = post.start_time.slice(0, 10).split('-').map(Number)
  return `${y}-${mo - 1}-${d}` // month 0-indexed to match keyToDate
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

// Supported languages for the public feed language picker
const LANGUAGES = [
  { code: 'en',    label: 'English' },
  { code: 'es',    label: 'Español' },
  { code: 'ar',    label: 'العربية' },
  { code: 'so',    label: 'Soomaali' },
  { code: 'tl',    label: 'Filipino' },
  { code: 'vi',    label: 'Tiếng Việt' },
  { code: 'zh-CN', label: '中文 (简体)' },
  { code: 'ru',    label: 'Русский' },
  { code: 'fa',    label: 'فارسی' },
  { code: 'hy',    label: 'Հայերեն' },
  { code: 'km',    label: 'ខ្មែរ' },
]

/**
 * Trigger Google Translate to switch the page to `langCode`.
 * Uses the `googtrans` cookie mechanism — identical to what the
 * native Translate widget sets when the user picks a language.
 * This approach works for async / React-rendered content because
 * Google's MutationObserver re-scans the DOM whenever new nodes
 * are inserted (e.g. after a Supabase data load).
 */
function applyGoogleTranslate(langCode) {
  const cookieValue = langCode === 'en' ? '' : `/en/${langCode}`

  // Set the cookie on both the current path and the root so the
  // widget picks it up regardless of the SPA route.
  const expiry = langCode === 'en'
    ? 'Thu, 01 Jan 1970 00:00:00 GMT' // expire = clear
    : 'Fri, 01 Jan 2100 00:00:00 GMT'
  document.cookie = `googtrans=${cookieValue}; expires=${expiry}; path=/`
  document.cookie = `googtrans=${cookieValue}; expires=${expiry}; path=/; domain=${location.hostname}`

  // Ask the Google Translate widget to re-translate with the new cookie
  const select = document.querySelector('.goog-te-combo')
  if (select) {
    select.value = langCode === 'en' ? '' : langCode
    select.dispatchEvent(new Event('change'))
  } else {
    // Widget not ready yet — reload so the cookie is picked up on init
    location.reload()
  }
}

export default function PublicFeed() {
  const { session, isAppAdmin, memberships } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [posts, setPosts]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadError, setLoadError]   = useState('')
  const [postDetails, setPostDetails] = useState({}) // { [id]: { description, image_url, tags } }
  const [expanded, setExpanded]     = useState(null)
  const [reactions, setReactions]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('feedReactions') ?? '{}') } catch { return {} }
  })
  const [toast, setToast]           = useState('')
  const [activeTab, setActiveTab]   = useState('map')
  const [feedCityFilter, setFeedCityFilter] = useState('')
  const [visibleCount, setVisibleCount] = useState(50)
  const [pinnedPost, setPinnedPost]     = useState(null)
  // Read active language from the googtrans cookie on mount so the
  // picker stays in sync if the page was reloaded after a language switch.
  const [language, setLanguage] = useState(() => {
    const match = document.cookie.match(/(?:^|;\s*)googtrans=\/en\/([^;]+)/)
    return match ? match[1] : 'en'
  })
  const mapRef           = useRef(null)
  const mapDivRef        = useRef(null)
  const markersRef       = useRef([])
  const themeRef         = useRef(theme)
  const pendingScrollRef = useRef(null)

  useEffect(() => { themeRef.current = theme }, [theme])

  useEffect(() => {
    if (!pendingScrollRef.current) return
    const id = pendingScrollRef.current
    pendingScrollRef.current = null
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }, [visibleCount])

  useEffect(() => {
    loadPosts()
    loadMaps()
    loadPinnedPost()
  }, [])

  async function loadPinnedPost() {
    const { data } = await supabase
      .from('pinned_posts')
      .select('id, title, description, posted_date, link_url')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setPinnedPost(data ?? null)
  }

  async function loadPosts() {
    setLoadError('')
    // Start of today in local time — keeps events visible all day even if they started earlier
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayISO = todayStart.toISOString()

    // Only select columns needed for the list / map view.
    // description, image_url, and tags are fetched on-demand when a card is expanded.
    const LIST_COLS = 'id, title, address, city, zip, latitude, longitude, start_time, end_time, category, is_recurring, created_at, organizations(name)'

    // ── 1. Non-recurring posts: only fetch today-onward (or no date = ongoing) ──
    const { data: nonRecurring, error: err1 } = await supabase
      .from('posts')
      .select(LIST_COLS)
      .eq('is_active', true)
      .eq('status', 'published')
      .eq('is_recurring', false)
      .or(`start_time.gte.${todayISO},start_time.is.null`)
      .order('start_time', { ascending: true, nullsFirst: false })

    if (err1) {
      console.error('loadPosts (non-recurring):', err1)
      setLoadError('Failed to load posts. Please refresh the page.')
      setLoading(false)
      return
    }

    // ── 2. Recurring posts: fetch all, then resolve the next upcoming occurrence ──
    const { data: recurringPosts, error: err2 } = await supabase
      .from('posts')
      .select(LIST_COLS)
      .eq('is_active', true)
      .eq('status', 'published')
      .eq('is_recurring', true)

    if (err2) {
      console.error('loadPosts (recurring):', err2)
      setLoadError('Failed to load recurring posts. Please refresh the page.')
      setLoading(false)
      return
    }

    // All recurring posts now use the individual-occurrence model:
    // each post row has its own start_time. Just filter to today-or-future.
    const recurringWithNext = (recurringPosts ?? []).flatMap(p => {
      if (p.start_time && new Date(p.start_time) >= new Date(todayISO)) return [p]
      return [] // past — drop
    })

    // ── 3. Merge and sort: dated posts ascending, undated posts at the end ──
    const merged = [...(nonRecurring ?? []), ...recurringWithNext].sort((a, b) => {
      if (!a.start_time && !b.start_time) return 0
      if (!a.start_time) return 1
      if (!b.start_time) return -1
      return new Date(a.start_time) - new Date(b.start_time)
    })

    setPosts(merged)
    setLoading(false)
  }

  // Lazy-load a single post's description, image, and tags the first time its card is expanded.
  async function loadPostDetail(postId) {
    if (postDetails[postId]) return // already cached
    const { data, error } = await supabase
      .from('posts')
      .select('description, image_url, tags, organizer_phone')
      .eq('id', postId)
      .single()
    if (error) { console.error('loadPostDetail:', error); return }
    setPostDetails(prev => ({ ...prev, [postId]: data }))
  }

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

    // Expose global so InfoWindow date links can scroll the feed
    window.__ecfn_gotoPost = (postId) => {
      const p = posts.find(x => x.id === postId)
      if (!p || !p.start_time) return
      const d = parseNaiveDate(p.start_time)
      const fid = `feed-${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const sorted = [...posts].filter(x => x.start_time).sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
      const idx = sorted.findIndex(x => x.id === postId)
      if (idx !== -1 && idx >= visibleCount) {
        setVisibleCount(idx + 1)
        pendingScrollRef.current = fid
      } else {
        document.getElementById(fid)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

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
      const dateTimeStr = post.start_time
        ? `${fmtDateShort(post.start_time)} · ${fmtTime(post.start_time)}`
        : ''
      const iw = new window.google.maps.InfoWindow({
        content: `<div style="font-family:Inter,sans-serif;max-width:220px;padding:4px 26px 2px 0"><b style="color:${color};font-size:13px;line-height:1.3;display:block">${post.title}</b><p style="margin:3px 0 0;font-size:11px;color:#888">${post.organizations?.name ?? ''}</p>${post.address ? `<p style="font-size:11px;margin:3px 0 0;color:#666">📍 ${post.address}</p>` : ''}${dateTimeStr ? `<a href="#" onclick="event.preventDefault();window.__ecfn_gotoPost('${post.id}')" style="display:block;margin-top:7px;font-size:11px;font-weight:700;color:${color};text-decoration:none;cursor:pointer">🕐 ${dateTimeStr} ↓</a>` : ''}</div>`,
      })
      marker.addListener('click', () => {
        markersRef.current.forEach(m => m.infoWindow?.close())
        iw.open(mapRef.current, marker)
        if (post.start_time) {
          const d = parseNaiveDate(post.start_time)
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
      marker._postId = post.id  // store ID so panTo can find the right marker even with duplicate titles
      markersRef.current.push(marker)
    })
  }, [posts, visibleCount])

  function panTo(post) {
    if (!mapRef.current || !post.latitude || !post.longitude) return
    mapRef.current.panTo({ lat: post.latitude, lng: post.longitude })
    mapRef.current.setZoom(15)
    // Match by stored post ID, not title, to handle posts with identical names
    const marker = markersRef.current.find(m => m._postId === post.id)
    if (marker?.infoWindow) {
      markersRef.current.forEach(m => m.infoWindow?.close())
      marker.infoWindow.open(mapRef.current, marker)
    }
  }

  function toggleExpand(id) {
    const next = expanded === id ? null : id
    setExpanded(next)
    if (next) {
      const post = posts.find(p => p.id === next)
      if (post) panTo(post)
      loadPostDetail(next)
    }
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
      <style>{`
        /* Desktop: sticky header */
        .pub-header { position: sticky; top: 0; z-index: 100; }
        /* Mobile: static + compact */
        @media (max-width: 640px) {
          .pub-header { position: static !important; }
          .pub-header-inner { padding: 0.45rem 0.875rem !important; gap: 0.5rem !important; }
          .pub-logo { max-height: 30px !important; }
          .pub-subtitle, .pub-maintained { display: none !important; }
          .pub-title { font-size: 0.95rem !important; line-height: 1.15 !important; }
        }
        /* Compact Google Maps InfoWindow — removes excess padding and blank X-button row */
        .gm-style .gm-style-iw-c { padding: 10px 12px 10px !important; }
        .gm-style .gm-style-iw-d { overflow: hidden !important; }
        /* Float the close button over the top-right corner — eliminates the empty header row */
        .gm-style .gm-style-iw-chr { position: absolute !important; top: 2px !important; right: 2px !important; height: 0 !important; overflow: visible !important; }
        .gm-style .gm-ui-hover-effect { opacity: 0.65; }
      `}</style>

      {/* Header — sticky on desktop, static on mobile */}
      <header className="pub-header" style={{
        background: isDark
          ? 'linear-gradient(135deg, hsl(28,95%,55%) 0%, hsl(340,82%,52%) 100%)'
          : 'var(--color-bg-dark)',
        borderBottom: isDark ? 'none' : '1px solid var(--color-border)',
        boxShadow: isDark ? '0 2px 16px rgba(0,0,0,0.28)' : '0 1px 6px rgba(0,0,0,0.06)',
        transition: 'background 200ms ease, box-shadow 200ms ease',
      }}>
        <div className="pub-header-inner" style={{ maxWidth: 960, margin: '0 auto', padding: '0.875rem 1.5rem', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'stretch', gap: '1rem' }}>

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
              <img src="/el-cajob-collab.png" alt="El Cajon Collaborative" className="pub-logo" style={{ height: '100%', width: 'auto', objectFit: 'contain', maxHeight: 44 }} />
            </a>
          </div>

          {/* Center: title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', textAlign: 'center', alignItems: 'center', justifyContent: 'center' }}>
            <span className="pub-title" style={{
              fontFamily: 'Outfit, sans-serif', fontWeight: 800,
              fontSize: 'clamp(1.1rem, 2.8vw, 1.4rem)', lineHeight: 1.2,
              ...(isDark
                ? { color: 'white' }
                : { background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }
              ),
            }}>
              East County Food Network
            </span>
            <span className="pub-subtitle" style={{ fontSize: '0.78rem', color: isDark ? 'rgba(255,255,255,0.85)' : 'var(--color-text-secondary)', lineHeight: 1.3 }}>
              Local Food Pantries and Distributions in East County, San Diego
            </span>
            <span className="pub-maintained" style={{ fontSize: '0.72rem', color: isDark ? 'rgba(255,255,255,0.6)' : 'var(--color-text-muted)', lineHeight: 1.3 }}>
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

        {/* ── Language selector ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: '0.78rem', fontWeight: 600,
            color: 'var(--color-text-muted)',
            display: 'flex', alignItems: 'center', gap: '0.35rem',
            flexShrink: 0,
          }}>
            🌐 Language:
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => {
                  setLanguage(lang.code)
                  applyGoogleTranslate(lang.code)
                }}
                style={{
                  padding: '3px 12px',
                  borderRadius: 20,
                  fontSize: '0.76rem',
                  fontWeight: language === lang.code ? 700 : 500,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: language === lang.code ? 'var(--color-primary)' : 'var(--color-border)',
                  background: language === lang.code
                    ? 'hsla(28,95%,55%,0.15)'
                    : 'var(--color-surface)',
                  color: language === lang.code
                    ? 'var(--color-primary)'
                    : 'var(--color-text-secondary)',
                  transition: 'all 140ms',
                  whiteSpace: 'nowrap',
                }}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

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

        {/* Pinned announcement + partner org links */}
        {pinnedPost ? (
          /* Two-column: pinned card left, partner orgs right */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem',
          }}>

            {/* Left: Pinned announcement card */}
            <div style={{
              padding: '1.25rem',
              background: isDark ? 'hsla(28,95%,55%,0.07)' : 'hsla(28,95%,55%,0.05)',
              border: '1px solid hsla(28,95%,55%,0.28)',
              borderRadius: 14,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}>
              {/* Posted date — small, top-right corner */}
              <span style={{
                position: 'absolute', top: '0.75rem', right: '1rem',
                fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500,
              }}>
                {new Date(pinnedPost.posted_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ fontSize: '1rem' }}>📣</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--color-primary)' }}>Announcements</span>
              </div>
              <p style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.3, paddingRight: '5rem' }}>
                {pinnedPost.link_url ? (
                  <a
                    href={pinnedPost.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-text-primary)', textDecoration: 'none' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--color-primary)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-primary)'}
                  >{pinnedPost.title}</a>
                ) : pinnedPost.title}
              </p>
              {pinnedPost.description && (
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }}>
                  {pinnedPost.description}
                </p>
              )}
              {pinnedPost.link_url && (
                <a
                  href={pinnedPost.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none', marginTop: 'auto', paddingTop: '0.25rem' }}
                >
                  Learn more →
                </a>
              )}
            </div>

            {/* Right: Combined partner orgs box */}
            <div style={{
              padding: '1rem 1.25rem',
              background: 'var(--color-bg-medium)',
              border: '1px solid var(--color-border)',
              borderRadius: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)', textAlign: 'center' }}>Reliable Food Providers</span>
              {/* SD Food Bank */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <a href="https://www.sandiegofoodbank.org" target="_blank" rel="noopener noreferrer" style={{ display: 'block', lineHeight: 0 }}>
                    <img
                      src="https://www.vikingcold.com/wp-content/uploads/2019/11/san-diego-food-bank.png"
                      alt="San Diego Food Bank"
                      style={{ height: 28, width: 'auto', display: 'block', objectFit: 'contain' }}
                    />
                  </a>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem' }}><a href="https://www.sandiegofoodbank.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-primary)', textDecoration: 'none' }}>San Diego Food Bank</a></span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                  County-wide food distributions and pantries.
                </p>
              </div>
              <div style={{ height: 1, background: 'var(--color-border)' }} />
              {/* Feeding San Diego */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <a href="https://feedingsandiego.org" target="_blank" rel="noopener noreferrer" style={{ display: 'block', lineHeight: 0 }}>
                    <img
                      src="https://feedingsandiego.org/wp-content/uploads/2021/03/Feeding-San-Diego-Logo-Color.png"
                      alt="Feeding San Diego"
                      style={{ height: 28, width: 'auto', display: 'block', objectFit: 'contain' }}
                    />
                  </a>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem' }}><a href="https://feedingsandiego.org" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-text-primary)', textDecoration: 'none' }}>Feeding San Diego</a></span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                  Surplus food rescue and regional distribution sites.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* No pinned post — partner orgs full-width, both orgs side by side */
          <div style={{
            padding: '1rem 1.25rem',
            background: 'var(--color-bg-medium)',
            border: '1px solid var(--color-border)',
            borderRadius: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            marginBottom: '2rem',
          }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-muted)', textAlign: 'center' }}>Reliable Food Providers</span>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              {/* SD Food Bank */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', flex: '1 1 200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <a href="https://www.sandiegofoodbank.org" target="_blank" rel="noopener noreferrer" style={{ display: 'block', lineHeight: 0 }}>
                    <img
                      src="https://www.vikingcold.com/wp-content/uploads/2019/11/san-diego-food-bank.png"
                      alt="San Diego Food Bank"
                      style={{ height: 28, width: 'auto', display: 'block', objectFit: 'contain' }}
                    />
                  </a>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--color-text-primary)' }}>San Diego Food Bank</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                  County-wide food distributions and pantries.
                </p>
              </div>
              {/* Feeding San Diego */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', flex: '1 1 200px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <a href="https://feedingsandiego.org" target="_blank" rel="noopener noreferrer" style={{ display: 'block', lineHeight: 0 }}>
                    <img
                      src="https://feedingsandiego.org/wp-content/uploads/2021/03/Feeding-San-Diego-Logo-Color.png"
                      alt="Feeding San Diego"
                      style={{ height: 28, width: 'auto', display: 'block', objectFit: 'contain' }}
                    />
                  </a>
                  <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--color-text-primary)' }}>Feeding San Diego</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0, textAlign: 'center' }}>
                  Surplus food rescue and regional distribution sites.
                </p>
              </div>
            </div>
          </div>
        )}

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

            {/* Calendar — lazy loaded; react-big-calendar only downloads on first tab click */}
            {activeTab === 'calendar' && (
              <Suspense fallback={
                <div style={{ height: 560, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-medium)' }}>
                  <p style={{ color: 'var(--color-text-muted)' }}>Loading calendar…</p>
                </div>
              }>
                <CalendarPanel posts={posts} onSelectEvent={handleCalendarEventClick} />
              </Suspense>
            )}
          </div>
        </div>

        {/* Feed */}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h2 style={{
            fontFamily: 'Outfit, sans-serif', fontSize: '1.35rem', fontWeight: 700,
            margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem',
            color: 'var(--color-text-primary)',
          }}>
            Upcoming Events, Sorted by Date
          </h2>
          {posts.length > 0 && (
            <select
              value={feedCityFilter}
              onChange={e => { setFeedCityFilter(e.target.value); setVisibleCount(50); }}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                fontSize: '0.9rem',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">All Cities</option>
              {[...new Set(posts.map(p => p.city?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(city => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>Loading resources…</p>
        ) : loadError ? (
          <p style={{ color: 'var(--color-error)', textAlign: 'center', padding: '3rem' }}>{loadError}</p>
        ) : posts.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>📭 No active posts yet.</p>
        ) : (() => {
          const filteredPosts = feedCityFilter 
            ? posts.filter(p => p.city?.trim().toLowerCase() === feedCityFilter.toLowerCase()) 
            : posts
          
          if (filteredPosts.length === 0) {
            return <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '3rem' }}>No events found for {feedCityFilter}.</p>
          }

          const sortedPosts = [...filteredPosts].filter(p => p.start_time).sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
          const noDates = filteredPosts.filter(p => !p.start_time)
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
                            <p style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '0.4rem', display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
                              <span>
                                🕐 {fmtTime(post.start_time)}
                                {post.end_time ? ` – ${fmtTime(post.end_time)}` : ''}
                              </span>
                              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>
                                {fmtDateShort(post.start_time)}
                              </span>
                            </p>
                          )}

                          {/* Provider + category + resource tags */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: post.address ? '0.3rem' : 0 }}>
                            <span style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                              {orgName || 'Anonymous'}
                            </span>
                            <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44` }}>
                              {post.category ?? 'food'}
                            </span>
                            {(() => {
                              const SKIP = new Set(['Feeding San Diego', 'San Diego Food Bank', 'food-distribution', post.category ?? ''])
                              const DAY_SET = new Set(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])
                              return (post.tags ?? [])
                                .filter(t => t && !SKIP.has(t) && !DAY_SET.has(t))
                                .slice(0, 2)
                                .map(t => (
                                  <span key={t} style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 600, background: 'hsla(142,60%,45%,0.12)', color: 'var(--color-success)', border: '1px solid hsla(142,60%,45%,0.3)' }}>
                                    {t}
                                  </span>
                                ))
                            })()}
                          </div>

                          {/* Address */}
                          {post.address && (
                            <p style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)' }}>
                              📍 {post.address}{post.city ? `, ${post.city}` : ''}
                            </p>
                          )}

                          {/* Expanded content — details loaded on-demand to reduce initial bandwidth */}
                          {isOpen && (
                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: `1px solid var(--color-border)` }}>
                              {!postDetails[post.id] ? (
                                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Loading details…</p>
                              ) : (
                                <>
                                  {postDetails[post.id].description && (
                                    <div style={{ marginBottom: '0.75rem' }}>
                                      {postDetails[post.id].description.split('\n\n').map((block, bi) => (
                                        <p key={bi} style={{ color: 'var(--color-text-secondary)', lineHeight: 1.65, fontSize: '0.88rem', margin: bi === 0 ? '0 0 0.5rem' : '0.6rem 0 0', whiteSpace: 'pre-line' }}>{block}</p>
                                      ))}
                                    </div>
                                  )}
                                  {postDetails[post.id].organizer_phone && (
                                    <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                      <span>📞</span>
                                      <a href={`tel:${postDetails[post.id].organizer_phone}`} style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }} onClick={e => e.stopPropagation()}>
                                        {postDetails[post.id].organizer_phone}
                                      </a>
                                    </p>
                                  )}
                                  {(() => {
                                    const isFsd  = post.source_id?.startsWith('fsd_')
                                    const isSdfb = post.source_id?.startsWith('sdfb_')
                                    if ((isFsd || isSdfb) && postDetails[post.id].image_url) {
                                      const href  = isFsd ? 'https://feedingsandiego.org' : 'https://www.sandiegofoodbank.org'
                                      const label = isFsd ? 'feedingsandiego.org' : 'sandiegofoodbank.org'
                                      const name  = isFsd ? 'Feeding San Diego' : 'San Diego Food Bank'
                                      return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--color-surface)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                                          <img src={postDetails[post.id].image_url} alt={name} style={{ height: 'auto', width: 'auto', maxHeight: 22, maxWidth: 22, objectFit: 'contain', flexShrink: 0 }} />
                                          <div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>Provided by</div>
                                            <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-primary)', textDecoration: 'none' }} onClick={e => e.stopPropagation()}>{label} →</a>
                                          </div>
                                        </div>
                                      )
                                    }
                                    return <PostAttachment url={postDetails[post.id].image_url} title={post.title} />
                                  })()}
                                  {postDetails[post.id].tags?.filter(t => t).length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.5rem' }}>
                                      {postDetails[post.id].tags.filter(t => t).map(t => (
                                        <span key={t} style={{ padding: '3px 10px', background: 'hsla(142,60%,45%,0.1)', borderRadius: 12, fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-success)', border: '1px solid hsla(142,60%,45%,0.25)' }}>{t}</span>
                                      ))}
                                    </div>
                                  )}
                                </>
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
                          {/* Created label + Directions — grouped right */}
                          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
                            {post.created_at && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                                Post created {new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                            )}
                            {post.address && (
                              <a
                                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([post.address, post.city, post.zip].filter(Boolean).join(', '))}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  padding: '4px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600,
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

// CalendarEvent has moved to src/components/CalendarPanel.jsx

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
