/**
 * syncFeedingSanDiego.js
 *
 * Fetches food distribution locations from Feeding San Diego's Storepoint API,
 * filters to East County ZIP codes, and upserts them as draft posts in Supabase.
 * Deactivates any previously synced posts that have disappeared from Storepoint.
 *
 * Run:  node scripts/syncFeedingSanDiego.js
 *
 * Required environment variables (GitHub Secrets → injected by Actions):
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)
 *   OPENAI_API_KEY            — GPT-4o-mini for natural-language schedule parsing
 */

import { createClient } from '@supabase/supabase-js'

// ─── Configuration ────────────────────────────────────────────────────────────

const STOREPOINT_URL    = 'https://api.storepoint.co/v1/16765f3e46d5c1/locations'
const FEEDING_SD_ORG_ID = 'c971ded9-2faa-40d2-b1dd-862a19839120'
const SOURCE_PREFIX     = 'fsd_'

// Storepoint custom-field IDs for Feeding San Diego.
// If schedule data stops appearing, re-check these keys in the raw API response.
const CF_SCHEDULE = 'l9y291xrn5'   // "2nd and 4th Wednesday of the month from 12:00 - 2:00 p.m."
const CF_CLOSURES = 'bqk2r0h4g4j'  // "Closed 6/8/26, 6/22/26…"

// East County San Diego ZIP codes.
// Edit this list to expand or restrict the geographic scope.
const EAST_COUNTY_ZIPS = new Set([
  '91901',                              // Alpine
  '91906',                              // Campo
  '91916',                              // Descanso
  '91917',                              // Dulzura
  '91935',                              // Jamul
  '91941', '91942', '91943', '91944',  // La Mesa
  '91945', '91946',                     // Lemon Grove
  '91962',                              // Pine Valley
  '91977', '91978', '91979',           // Spring Valley
  '92019', '92020', '92021',           // El Cajon
  '92040',                              // Lakeside
  '92071',                              // Santee
])

const DAY_FIELDS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
const DAY_INDEX  = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 }

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role: bypasses RLS for automated writes
)

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/**
 * Splits a Storepoint address string into { address, city, zip }.
 * Input format: "1234 Main St, El Cajon, CA 92020, US"
 */
function parseAddress(full) {
  const match = full?.trim().match(
    /^(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?),?\s*US$/i
  )
  if (!match) return { address: full ?? '', city: '', zip: '' }
  return { address: match[1].trim(), city: match[2].trim(), zip: match[4].trim() }
}

/** Safely parses the Storepoint custom_fields JSON string. */
function parseCustomFields(str) {
  if (!str) return {}
  try { return JSON.parse(str) } catch { return {} }
}

/**
 * Parses a time-range string like "9:00 AM - 10:30 AM".
 * Returns { startHour, startMinute, endHour, endMinute } or null.
 */
function parseTimeRange(str) {
  const match = str.trim().match(
    /^(\d{1,2}:\d{2}\s*[AP]M)\s*[-–]\s*(\d{1,2}:\d{2}\s*[AP]M)$/i
  )
  if (!match) return null

  function toHM(t) {
    const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
    if (!m) return null
    let h = parseInt(m[1])
    const min = parseInt(m[2])
    const ampm = m[3].toUpperCase()
    if (ampm === 'PM' && h !== 12) h += 12
    if (ampm === 'AM' && h === 12) h = 0
    return { h, min }
  }

  const s = toHM(match[1]), e = toHM(match[2])
  if (!s || !e) return null
  return { startHour: s.h, startMinute: s.min, endHour: e.h, endMinute: e.min }
}

/**
 * Returns the next Date on which a given day-of-week (0=Sun) occurs at the
 * given local hour:minute.  If today is that day but the time has passed,
 * returns next week's occurrence.
 */
function nextOccurrence(dayOfWeek, hour, minute) {
  const now  = new Date()
  const next = new Date(now)
  next.setHours(hour, minute, 0, 0)
  let diff = (dayOfWeek - now.getDay() + 7) % 7
  if (diff === 0 && next <= now) diff = 7
  next.setDate(next.getDate() + diff)
  return next
}

/**
 * Calls OpenAI GPT-4o-mini (via built-in fetch, no package needed) to parse a
 * natural-language schedule into a concrete next occurrence.
 */
async function parseScheduleWithAI(scheduleText, locationName) {
  if (!process.env.OPENAI_API_KEY) return { parsed: false }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const prompt = `You are a precise scheduling assistant for food distribution events.

Today: ${today}
Location: "${locationName}"
Schedule: "${scheduleText}"

Return the single NEXT upcoming occurrence as JSON. Rules:
- Return ONLY valid JSON, no markdown or explanation
- All datetimes in ISO 8601: "YYYY-MM-DDTHH:MM:00"
- "Next" = closest future occurrence strictly after now (or today if not yet passed)
- If schedule lists multiple patterns (e.g. "2nd and 4th Wednesday"), return only the single nearest one
- Convert "a.m."/"p.m." to 24-hour correctly

Success: {"parsed":true,"start":"2026-06-11T09:00:00","end":"2026-06-11T11:00:00"}
If end time unknown: {"parsed":true,"start":"2026-06-11T09:00:00","end":null}
If unparseable: {"parsed":false}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model:           'gpt-4o-mini',
        messages:        [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature:     0,
        max_tokens:      120,
      }),
    })
    const json = await res.json()
    return JSON.parse(json.choices[0].message.content)
  } catch (err) {
    console.error('    ⚠️  OpenAI API error:', err.message)
    return { parsed: false }
  }
}

// ─── Location → post payload(s) ───────────────────────────────────────────────

/**
 * Converts one Storepoint location object into one or more post payloads.
 *
 * Three schedule types are handled:
 *   A) Day-specific hours (monday/tuesday/… fields) → one post per active day-slot
 *   B) Natural-language schedule in custom_fields   → one post, AI-parsed date
 *   C) Insufficient schedule data                   → one post, flagged for review
 */
async function locationToPosts(loc) {
  const addr         = parseAddress(loc.streetaddress)
  const cf           = parseCustomFields(loc.custom_fields)
  const scheduleText = (cf[CF_SCHEDULE] ?? '').trim()
  const closureNotes = (cf[CF_CLOSURES]  ?? '').trim()

  // Tags: split Storepoint tags and always append "Feeding San Diego"
  const tags = [
    ...(loc.tags ? loc.tags.split(',').map(t => t.trim()).filter(Boolean) : []),
    'Feeding San Diego',
  ]

  // Shared description lines (closure notices, original description).
  // Phone is now stored in the organizer_phone column, not the description.
  const sharedLines = []
  if (loc.description) sharedLines.push(loc.description)
  if (closureNotes)    sharedLines.push(`⚠️ Closure notice: ${closureNotes}`)
  const sharedDesc = sharedLines.join('\n\n')

  // Common fields shared by every post from this location
  const base = {
    organization_id: FEEDING_SD_ORG_ID,
    title:           loc.name,
    location_name:   loc.name,
    address:         addr.address,
    city:            addr.city,
    zip:             addr.zip,
    latitude:        loc.loc_lat  || null,
    longitude:       loc.loc_long || null,
    category:        'food-distribution',
    tags,
    // Phone goes into its own column so the feed can render it as a tap-to-call link
    organizer_phone: loc.phone?.trim() || null,
    // Logo image — same one shown in the partner org box on the public feed.
    // Gives synced posts instant brand recognition when expanded.
    image_url:       'https://feedingsandiego.org/wp-content/uploads/2021/03/Feeding-San-Diego-Logo-Color.png',
    is_active:       true,
    is_recurring:    false,
    // Published so posts appear on the live feed immediately after sync.
    // Admins can unpublish individual posts if needed; that choice is preserved
    // across future syncs (upsertPost strips status from the update payload).
    status:          'published',
  }

  const posts = []

  // ── Type A: day-specific structured hours ──────────────────────────────────
  const activeDays = DAY_FIELDS.filter(d => loc[d]?.trim())

  if (activeDays.length > 0) {
    for (const day of activeDays) {
      const tr = parseTimeRange(loc[day])
      if (!tr) {
        console.warn(`    ⚠️  Could not parse time "${loc[day]}" for ${loc.name} (${day}) — skipping slot`)
        continue
      }

      const startDt = nextOccurrence(DAY_INDEX[day], tr.startHour, tr.startMinute)
      const endDt   = new Date(startDt)
      endDt.setHours(tr.endHour, tr.endMinute, 0, 0)

      const dayLabel = day.charAt(0).toUpperCase() + day.slice(1)
      const descLines = [`Recurring every ${dayLabel}: ${loc[day].trim()}.`]
      // Include the full custom schedule text if it adds information beyond "weekly"
      if (scheduleText && scheduleText.toLowerCase() !== 'weekly') {
        descLines.push(`Full schedule note: ${scheduleText}`)
      }
      if (sharedDesc) descLines.push(sharedDesc)

      posts.push({
        ...base,
        source_id:   `${SOURCE_PREFIX}${loc.id}_${day}`,
        description: descLines.join('\n\n'),
        start_time:  startDt.toISOString(),
        end_time:    endDt.toISOString(),
      })
    }
    return posts
  }

  // ── Type B: natural-language schedule → AI parsing ─────────────────────────
  if (scheduleText && scheduleText.toLowerCase() !== 'weekly') {
    console.log(`    🤖 AI parsing schedule: "${scheduleText}"`)
    const ai = await parseScheduleWithAI(scheduleText, loc.name)

    const descLines = []

    if (ai.parsed) {
      descLines.push(`Schedule: ${scheduleText}`)
    } else {
      descLines.push(
        '⚠️ REVIEW REQUIRED — Schedule could not be parsed automatically.\n' +
        'Please set the date and time manually before publishing.\n\n' +
        `Raw schedule: ${scheduleText}`
      )
    }
    if (sharedDesc) descLines.push(sharedDesc)

    posts.push({
      ...base,
      source_id:   `${SOURCE_PREFIX}${loc.id}_custom`,
      description: descLines.join('\n\n'),
      start_time:  ai.parsed ? (ai.start ?? null) : null,
      end_time:    ai.parsed ? (ai.end   ?? null) : null,
    })
    return posts
  }

  // ── Type C: no usable schedule data — flag for manual review ───────────────
  const descLines = [
    '⚠️ REVIEW REQUIRED — No schedule information could be determined.\n' +
    'Please set the date and time manually before publishing.',
  ]
  if (scheduleText) descLines.push(`Raw schedule text: ${scheduleText}`)
  if (sharedDesc)   descLines.push(sharedDesc)

  posts.push({
    ...base,
    source_id:   `${SOURCE_PREFIX}${loc.id}_custom`,
    description: descLines.join('\n\n'),
    start_time:  null,
    end_time:    null,
  })
  return posts
}

// ─── Database operations ──────────────────────────────────────────────────────

/**
 * Upserts a single post.
 *
 * Duplicate rules:
 *   1. Same source_id → update (admin's status and is_active are preserved).
 *   2. Different source_id but same address + start_time → skip (always a duplicate).
 *
 * Returns: 'new' | 'updated' | 'skipped'
 */
async function upsertPost(post) {

  // ── Duplicate guard: address + start_time collision with a different source ──
  if (post.start_time) {
    const { data: dupe } = await supabase
      .from('posts')
      .select('id, title, source_id')
      .eq('address',    post.address)
      .eq('start_time', post.start_time)
      .neq('source_id', post.source_id)
      .maybeSingle()

    if (dupe) {
      console.log(
        `    ⏩ Skipped — duplicate of "${dupe.title}" (same address + time)`
      )
      return 'skipped'
    }
  }

  // ── Check for existing record by source_id ──────────────────────────────────
  const { data: existing } = await supabase
    .from('posts')
    .select('id, status, is_active')
    .eq('source_id', post.source_id)
    .maybeSingle()

  if (existing) {
    // UPDATE: refresh all data fields but preserve admin's status and is_active decisions.
    // Note: if an admin deactivated a post manually, that choice is respected until the
    // location vanishes from Storepoint entirely (handled by deactivateVanished below).
    const { status, is_active, ...dataFields } = post
    const { error } = await supabase
      .from('posts')
      .update(dataFields)
      .eq('id', existing.id)

    if (error) {
      console.error(`    ✗ Update failed [${post.source_id}]:`, error.message)
      return 'skipped'
    }
    console.log(`    ↻ Updated: ${post.title}`)
    return 'updated'
  }

  // INSERT: brand-new post, always starts as draft
  const { error } = await supabase.from('posts').insert(post)
  if (error) {
    console.error(`    ✗ Insert failed [${post.source_id}]:`, error.message)
    return 'skipped'
  }
  console.log(`    ✨ New draft: ${post.title}`)
  return 'new'
}

/**
 * Deactivates any FSD posts whose source_id is no longer in the current Storepoint
 * batch — meaning the location has left Feeding San Diego's network.
 */
async function deactivateVanished(processedIds) {
  const { data: activeFsd, error } = await supabase
    .from('posts')
    .select('id, source_id, title, description')
    .like('source_id', `${SOURCE_PREFIX}%`)
    .eq('is_active', true)

  if (error) {
    console.error('  ✗ Could not fetch existing FSD posts:', error.message)
    return 0
  }

  const vanished = (activeFsd ?? []).filter(p => !processedIds.has(p.source_id))
  if (vanished.length === 0) { console.log('  ✓ No vanished locations.'); return 0 }

  const runDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  for (const post of vanished) {
    const notice = `[Auto-deactivated ${runDate} — location no longer in Feeding San Diego's directory.]`
    const { error: err } = await supabase
      .from('posts')
      .update({
        is_active:   false,
        description: `${notice}\n\n${post.description ?? ''}`.trim(),
      })
      .eq('id', post.id)

    if (err) console.error(`  ✗ Deactivate failed for "${post.title}":`, err.message)
    else     console.log(`  🗑️  Deactivated (vanished): ${post.title} [${post.source_id}]`)
  }

  return vanished.length
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`🔄  Feeding San Diego sync — ${new Date().toLocaleString()}`)
  console.log(`${'─'.repeat(60)}\n`)

  // Validate required environment variables
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k])
  if (missing.length) {
    console.error('❌  Missing required environment variables:', missing.join(', '))
    process.exit(1)
  }
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️   OPENAI_API_KEY not set — natural-language schedules will be flagged for manual review.\n')
  }

  // ── 1. Fetch all locations from Storepoint ──────────────────────────────────
  console.log('📡  Fetching from Storepoint API…')
  const res = await fetch(STOREPOINT_URL)
  if (!res.ok) {
    console.error(`❌  Storepoint API returned HTTP ${res.status}`)
    process.exit(1)
  }
  const { results } = await res.json()
  const allLocations = results?.locations ?? []
  console.log(`    ${allLocations.length} total locations received`)

  // ── 2. Filter to East County ZIP codes ─────────────────────────────────────
  const eastCounty = allLocations.filter(loc => {
    const { zip } = parseAddress(loc.streetaddress)
    return EAST_COUNTY_ZIPS.has(zip)
  })
  console.log(`    ${eastCounty.length} East County locations after ZIP filter\n`)

  // ── 3. Process each location ────────────────────────────────────────────────
  const processedIds = new Set()
  const counts = { new: 0, updated: 0, skipped: 0 }

  for (const loc of eastCounty) {
    console.log(`📍  ${loc.name}  (${loc.streetaddress})`)

    let posts
    try {
      posts = await locationToPosts(loc)
    } catch (err) {
      console.error(`    ✗ Error building post for ${loc.name}:`, err.message)
      continue
    }

    if (posts.length === 0) {
      console.log('    ⚠️  No valid day-slots found — location skipped')
      continue
    }

    for (const post of posts) {
      processedIds.add(post.source_id)
      const result = await upsertPost(post)
      counts[result]++
    }
  }

  // ── 4. Deactivate vanished locations ────────────────────────────────────────
  console.log('\n🧹  Checking for vanished locations…')
  const deactivated = await deactivateVanished(processedIds)

  // ── 5. Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`)
  console.log('✅  Sync complete\n')
  console.log(`    ${eastCounty.length} East County locations processed`)
  console.log(`    ${processedIds.size} total post slots evaluated`)
  console.log(`    ${counts.new}       new draft posts created`)
  console.log(`    ${counts.updated}   existing posts refreshed`)
  console.log(`    ${counts.skipped}   skipped (duplicates or errors)`)
  console.log(`    ${deactivated}      deactivated (vanished from Storepoint)`)
  console.log(`${'─'.repeat(60)}\n`)
}

main().catch(err => {
  console.error('\n❌  Fatal error:', err)
  process.exit(1)
})
