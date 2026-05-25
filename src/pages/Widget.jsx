import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

function mapsLink(address, city) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([address, city].filter(Boolean).join(', '))}`
}

function timeLabel(dt) {
  if (!dt) return null
  const d = new Date(dt)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function dateLabel(dt) {
  if (!dt) return null
  const d = new Date(dt)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tom = new Date(today); tom.setDate(tom.getDate() + 1)
  if (d >= today && d < tom) return 'Today'
  if (d >= tom && d < new Date(tom.getTime() + 86400000)) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function categorise(posts) {
  const now = new Date()
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const nextWeek = new Date(today); nextWeek.setDate(nextWeek.getDate() + 7)

  const todayPosts    = []
  const upcomingPosts = []
  const futurePosts   = []
  const pastPosts     = []

  for (const p of posts) {
    const start = p.start_time ? new Date(p.start_time) : null
    const end   = p.end_time   ? new Date(p.end_time)   : null

    if (end && end < now) { pastPosts.push(p); continue }

    if (!start) { upcomingPosts.push(p); continue }

    if (start >= today && start < tomorrow) { todayPosts.push(p); continue }
    if (start >= tomorrow && start < nextWeek) { upcomingPosts.push(p); continue }
    if (start >= nextWeek) { futurePosts.push(p); continue }

    pastPosts.push(p)
  }

  return { todayPosts, upcomingPosts, futurePosts, pastPosts }
}

function PostRow({ post }) {
  const [expanded, setExpanded] = useState(false)
  const start = post.start_time ? new Date(post.start_time) : null
  const end   = post.end_time   ? new Date(post.end_time)   : null

  const timeStr = [start && timeLabel(start), end && timeLabel(end)].filter(Boolean).join(' – ')
  const dateStr = start ? dateLabel(start) : null

  return (
    <div style={{
      borderBottom: '1px solid var(--color-border)',
      padding: '0.875rem 0',
    }}>
      <div
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}
        onClick={() => setExpanded(v => !v)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.2rem', color: 'var(--color-text-primary)' }}>
            {post.title}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {post.organizations?.name && <span>🏢 {post.organizations.name}</span>}
            {post.address && <span>📍 {post.address}{post.city ? `, ${post.city}` : ''}</span>}
            {timeStr && <span>🕐 {timeStr}</span>}
          </div>
        </div>
        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', flexShrink: 0 }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>
          {post.description && (
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '0.5rem', lineHeight: 1.6 }}>
              {post.description}
            </p>
          )}
          {post.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.5rem' }}>
              {post.tags.map(t => (
                <span key={t} style={{ padding: '2px 10px', background: 'var(--color-surface)', borderRadius: 12, fontSize: '0.75rem', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                  {t}
                </span>
              ))}
            </div>
          )}
          {(post.address || post.city) && (
            <a
              href={mapsLink(post.address, post.city)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-accent)', fontWeight: 600, fontSize: '0.8rem', textDecoration: 'none' }}
              onClick={e => e.stopPropagation()}
            >
              🗺 Get directions
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function Section({ title, posts, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  if (posts.length === 0) return null
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', textAlign: 'left', background: 'var(--color-surface)', border: 'none',
          borderRadius: 8, padding: '0.5rem 0.875rem', fontWeight: 700, fontSize: '0.85rem',
          color: 'var(--color-text-secondary)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
          marginBottom: '0.5rem',
        }}
      >
        <span>{title} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>({posts.length})</span></span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && posts.map(p => <PostRow key={p.id} post={p} />)}
    </div>
  )
}

export default function Widget() {
  const [posts, setPosts]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [showPast, setShowPast]     = useState(false)

  useEffect(() => {
    supabase
      .from('posts')
      .select('*, organizations(name)')
      .eq('is_active', true)
      .eq('status', 'published')
      .order('start_time', { ascending: true, nullsLast: true })
      .then(({ data }) => {
        setPosts(data ?? [])
        setLoading(false)
      })
  }, [])

  const { todayPosts, upcomingPosts, futurePosts, pastPosts } = categorise(posts)

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: 'var(--color-bg-dark)', color: 'var(--color-text-primary)', minHeight: '100vh', padding: '1rem' }}>

      <div style={{
        background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))',
        borderRadius: 12, padding: '0.875rem 1rem', marginBottom: '1.25rem',
      }}>
        <h1 style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 800, fontSize: '1.15rem', color: 'white' }}>
          🥗 East County Food Network
        </h1>
        <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.85)', marginTop: '0.15rem' }}>
          Free food resources in San Diego County
        </p>
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>Loading resources…</p>
      ) : posts.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem', fontSize: '0.9rem' }}>No resources posted yet. Check back soon!</p>
      ) : (
        <>
          <Section title="Today" posts={todayPosts} defaultOpen={true} />
          <Section title="This Week" posts={upcomingPosts} defaultOpen={true} />
          <Section title="Coming Up" posts={futurePosts} defaultOpen={false} />

          {pastPosts.length > 0 && (
            <div>
              <button
                onClick={() => setShowPast(v => !v)}
                style={{
                  background: 'none', border: 'none', color: 'var(--color-text-muted)',
                  fontSize: '0.8rem', cursor: 'pointer', padding: '0.25rem 0', marginBottom: '0.5rem',
                }}
              >
                {showPast ? '▲ Hide past events' : `▼ Show ${pastPosts.length} past event${pastPosts.length > 1 ? 's' : ''}`}
              </button>
              {showPast && pastPosts.map(p => <PostRow key={p.id} post={p} />)}
            </div>
          )}
        </>
      )}

      <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
        Powered by <a href="/" style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>East County Food Network</a>
      </p>
    </div>
  )
}
