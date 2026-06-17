/**
 * syncSdFoodBank.js
 *
 * Fetches food distribution locations from the San Diego Food Bank's Storepoint API,
 * filters to East County ZIP codes, parses natural-language schedules with GPT-4o-mini,
 * and upserts them as draft posts in Supabase.
 *
 * Run:  node scripts/syncSdFoodBank.js
 *
 * Required environment variables (GitHub Secrets → injected by Actions):
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)
 *   OPENAI_API_KEY            — GPT-4o-mini for schedule parsing
 *
 * One-time Supabase setup (run once in SQL Editor before first sync):
 *   INSERT INTO organizations (name, domain, is_verified)
 *   VALUES ('San Diego Food Bank', 'sandiegofoodbank.org', true)
 *   ON CONFLICT (domain) DO UPDATE SET name = 'San Diego Food Bank', is_verified = true;
 */

import { createClient } from '@supabase/supabase-js'

// ─── Configuration ────────────────────────────────────────────────────────────

const STOREPOINT_URL = 'https://api.storepoint.co/v1/16597334723364/locations'
const ORG_DOMAIN     = 'sandiegofoodbank.org'
const SOURCE_PREFIX  = 'sdfb_'

// Custom field keys for San Diego Food Bank's Storepoint configuration.
// If schedule data stops appearing, re-check these keys in the raw API response.
const CF_SCHEDULE      = 'neci8m1ih2'  // "1st and 3rd Thursday of the month 10:00am…"
const CF_RESCHEDULES   = '6hqa392kmt'  // "Reschedules: Jan 8. Cancellations: May 7…"
const CF_FOOD_TYPE     = 'r9lac8vy2c'  // "25–30 pounds of fresh produce; occasional dry goods."
const CF_ELIGIBILITY   = 'cooifgou2h'  // "All are welcome" / eligibility requirements
const CF_INSTRUCTIONS  = 't79gvzzldl'  // "Drive-thru only; bring a cart and reusable bags."

// East County San Diego ZIP codes (shared with syncFeedingSanDiego.js).
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

// ─── Supabase client ──────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role: bypasses RLS for automated writes
)

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/**
 * Splits a Storepoint address string into { address, city, zip }.
 * Handles both formats:
 *   "1234 Main St, El Cajon, CA 92020, US"  (Feeding SD style)
 *   "1234 Main St, El Cajon, CA 92020"       (SDFB style — no trailing ", US")
 */
function parseAddress(full) {
  const match = full?.trim().match(
    /^(.+?),\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?),?\s*(?:US)?$/i
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
 * Normalises and capitalises a comma-separated tag string.
 * Storepoint for SDFB uses lowercase tags like "thursday,neighborhood distribution".
 */
function normaliseTags(tagStr) {
  if (!tagStr) return []
  return tagStr
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.charAt(0).toUpperCase() + t.slice(1))
}

/**
 * Calls OpenAI GPT-4o-mini (via built-in fetch, no package needed) to parse a
 * natural-language schedule into the next concrete upcoming occurrence.
 *
 * The tags array is passed as a hint because SDFB includes the day of the week
 * as a tag (e.g. "Thursday"), which helps the model resolve ambiguous schedules.
 */
async function parseScheduleWithAI(scheduleText, locationName, dayHints) {
  if (!process.env.OPENAI_API_KEY) return { parsed: false }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const hintLine = dayHints.length
    ? `Day-of-week hints from tags: ${dayHints.join(', ')}`
    : ''

  const prompt = `You are a precise scheduling assistant for food distribution events.

Today: ${today}
Location: "${locationName}"
${hintLine}
Schedule: "${scheduleText}"

Return the single NEXT upcoming occurrence as JSON. Rules:
- Return ONLY valid JSON, no markdown or explanation
- All datetimes in ISO 8601: "YYYY-MM-DDTHH:MM:00"
- "Next" = closest future occurrence strictly after now (or today if not yet passed)
- If schedule lists multiple patterns (e.g. "1st and 3rd Thursday"), return only the single nearest one
- Convert "10:00am", "9:30 am", "2:00 p.m." etc. correctly to 24-hour ISO format
- If the end time is not stated, return null for "end"
- Use day-of-week hints to resolve any ambiguity about which day is intended

Success: {"parsed":true,"start":"2026-06-19T10:00:00","end":"2026-06-19T12:00:00"}
If end time unknown: {"parsed":true,"start":"2026-06-19T10:00:00","end":null}
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

// ─── Location → post payload ──────────────────────────────────────────────────

/**
 * Converts one Storepoint location into a single post payload.
 *
 * Unlike Feeding SD, SDFB locations never have structured day/hour fields —
 * all schedule data is in custom_fields, so every location goes through AI parsing.
 */
async function locationToPost(loc, orgId) {
  const addr = parseAddress(loc.streetaddress)
  const cf   = parseCustomFields(loc.custom_fields)

  const scheduleText   = (cf[CF_SCHEDULE]     ?? '').trim()
  const rescheduleText = (cf[CF_RESCHEDULES]  ?? '').trim()
  const foodType       = (cf[CF_FOOD_TYPE]    ?? '').trim()
  const eligibility    = (cf[CF_ELIGIBILITY]  ?? '').trim()
  const instructions   = (cf[CF_INSTRUCTIONS] ?? '').trim()

  // Normalise tags and extract day-of-week values as AI hints
  const rawTags  = normaliseTags(loc.tags)
  const dayNames = new Set(['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])
  const dayHints = rawTags.filter(t => dayNames.has(t))

  // Always append "San Diego Food Bank" tag
  const tags = [...new Set([...rawTags, 'San Diego Food Bank'])]

  // ── AI schedule parsing ──────────────────────────────────────────────────
  let startTime = null
  let endTime   = null
  let parsedOk  = false

  if (scheduleText) {
    console.log(`    🤖 Parsing: "${scheduleText}"`)
    const ai = await parseScheduleWithAI(scheduleText, loc.name, dayHints)
    if (ai.parsed) {
      startTime = ai.start ?? null
      endTime   = ai.end   ?? null
      parsedOk  = true
    }
  }

  // ── Build description ────────────────────────────────────────────────────
  const descLines = []

  if (!parsedOk) {
    descLines.push(
      '⚠️ REVIEW REQUIRED — Schedule could not be parsed automatically.\n' +
      'Please set the date and time manually before publishing.'
    )
  }

  if (scheduleText)   descLines.push(`📅 Schedule: ${scheduleText}`)
  if (rescheduleText) descLines.push(`⚠️ Reschedules / Cancellations: ${rescheduleText}`)
  if (foodType)       descLines.push(`🥕 Food provided: ${foodType}`)
  if (eligibility)    descLines.push(`✅ Eligibility: ${eligibility}`)
  if (instructions)   descLines.push(`ℹ️ Service instructions: ${instructions}`)
  if (loc.phone)      descLines.push(`📞 ${loc.phone}`)

  return {
    source_id:       `${SOURCE_PREFIX}${loc.id}`,
    organization_id: orgId,
    title:           loc.name,
    description:     descLines.join('\n\n'),
    address:         addr.address,
    city:            addr.city,
    zip:             addr.zip,
    latitude:        loc.loc_lat  || null,
    longitude:       loc.loc_long || null,
    start_time:      startTime,
    end_time:        endTime,
    category:        'food-distribution',
    tags,
    is_active:       true,
    is_recurring:    false,
    status:          'draft',
  }
}

// ─── Database operations ──────────────────────────────────────────────────────

/**
 * Upserts a single post.
 *
 * Duplicate rules:
 *   1. Same source_id           → update (admin's status and is_active are preserved).
 *   2. Same address + start_time → skip (always a duplicate, regardless of source).
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
      console.log(`    ⏩ Skipped — duplicate of "${dupe.title}" (same address + time)`)
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
    // UPDATE: refresh data fields but preserve admin's status and is_active decisions.
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
 * Deactivates any SDFB posts whose source_id is no longer in the current
 * Storepoint batch — meaning the location has left the Food Bank's network.
 */
async function deactivateVanished(processedIds) {
  const { data: activeSdfb, error } = await supabase
    .from('posts')
    .select('id, source_id, title, description')
    .like('source_id', `${SOURCE_PREFIX}%`)
    .eq('is_active', true)

  if (error) {
    console.error('  ✗ Could not fetch existing SDFB posts:', error.message)
    return 0
  }

  const vanished = (activeSdfb ?? []).filter(p => !processedIds.has(p.source_id))
  if (vanished.length === 0) { console.log('  ✓ No vanished locations.'); return 0 }

  const runDate = new Date().toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  })

  for (const post of vanished) {
    const notice = `[Auto-deactivated ${runDate} — location no longer in San Diego Food Bank's directory.]`
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
  console.log(`🔄  San Diego Food Bank sync — ${new Date().toLocaleString()}`)
  console.log(`${'─'.repeat(60)}\n`)

  // Validate required environment variables
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(k => !process.env[k])
  if (missing.length) {
    console.error('❌  Missing required environment variables:', missing.join(', '))
    process.exit(1)
  }
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️   OPENAI_API_KEY not set — all schedules will be flagged for manual review.\n')
  }

  // ── 1. Look up the San Diego Food Bank org in Supabase ─────────────────────
  console.log(`🏢  Looking up "${ORG_DOMAIN}" organization…`)
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('domain', ORG_DOMAIN)
    .single()

  if (orgErr || !org) {
    console.error(`❌  Organization not found for domain "${ORG_DOMAIN}".`)
    console.error('    Run this SQL in Supabase first:')
    console.error(`    INSERT INTO organizations (name, domain, is_verified)`)
    console.error(`    VALUES ('San Diego Food Bank', '${ORG_DOMAIN}', true)`)
    console.error(`    ON CONFLICT (domain) DO UPDATE SET is_verified = true;`)
    process.exit(1)
  }
  console.log(`    Found: "${org.name}" (${org.id})\n`)

  // ── 2. Fetch all locations from Storepoint ──────────────────────────────────
  console.log('📡  Fetching from Storepoint API…')
  const res = await fetch(STOREPOINT_URL)
  if (!res.ok) {
    console.error(`❌  Storepoint API returned HTTP ${res.status}`)
    process.exit(1)
  }
  const { results } = await res.json()
  const allLocations = results?.locations ?? []
  console.log(`    ${allLocations.length} total locations received`)

  // ── 3. Filter to East County ZIP codes ─────────────────────────────────────
  const eastCounty = allLocations.filter(loc => {
    const { zip } = parseAddress(loc.streetaddress)
    return EAST_COUNTY_ZIPS.has(zip)
  })
  console.log(`    ${eastCounty.length} East County locations after ZIP filter\n`)

  // ── 4. Process each location (all via AI schedule parsing) ─────────────────
  const processedIds = new Set()
  const counts = { new: 0, updated: 0, skipped: 0 }

  for (const loc of eastCounty) {
    console.log(`📍  ${loc.name}  (${loc.streetaddress})`)

    let post
    try {
      post = await locationToPost(loc, org.id)
    } catch (err) {
      console.error(`    ✗ Error building post for ${loc.name}:`, err.message)
      continue
    }

    processedIds.add(post.source_id)
    const result = await upsertPost(post)
    counts[result]++
  }

  // ── 5. Deactivate vanished locations ────────────────────────────────────────
  console.log('\n🧹  Checking for vanished locations…')
  const deactivated = await deactivateVanished(processedIds)

  // ── 6. Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`)
  console.log('✅  Sync complete\n')
  console.log(`    ${eastCounty.length} East County locations processed`)
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
