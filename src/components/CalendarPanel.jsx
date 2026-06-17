import { Calendar, dateFnsLocalizer } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'

const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales: { 'en-US': enUS } })

// All event times are PST — strip Supabase's +00 suffix before parsing
function parseNaiveDate(ts) {
  if (!ts) return null
  return new Date(ts.slice(0, 16).replace(' ', 'T'))
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

/**
 * CalendarPanel — lazy-loaded by PublicFeed when the Calendar tab is first opened.
 * Keeping react-big-calendar in this module means Vite can split it into a separate
 * chunk (~200 KB) that is never downloaded by users who only use the map view.
 */
export default function CalendarPanel({ posts, onSelectEvent }) {
  return (
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
          start:    parseNaiveDate(p.start_time),
          end:      parseNaiveDate(p.end_time) ?? parseNaiveDate(p.start_time),
          resource: p,
        }))}
        defaultView="month"
        views={['month', 'agenda']}
        style={{ height: '100%' }}
        onSelectEvent={onSelectEvent}
        components={{ event: CalendarEvent }}
        popup
      />
    </div>
  )
}
