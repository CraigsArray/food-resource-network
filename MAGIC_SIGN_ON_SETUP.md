# Magic Sign On — Setup Guide

This documents the two manual steps required to activate Magic Sign On for
SD Food Bank and Feeding San Diego.

---

## Step 1 — Register the two orgs in Supabase (SQL)

Run the following in the **Supabase SQL Editor**
(Dashboard → SQL Editor → New query):

```sql
-- Register San Diego Food Bank with domain-based access
INSERT INTO organizations (name, domain, is_verified, website)
VALUES (
  'San Diego Food Bank',
  'sandiegofoodbank.org',
  true,
  'https://www.sandiegofoodbank.org'
)
ON CONFLICT (domain) DO UPDATE
  SET name = EXCLUDED.name,
      is_verified = true;

-- Register Feeding San Diego with domain-based access
INSERT INTO organizations (name, domain, is_verified, website)
VALUES (
  'Feeding San Diego',
  'feedingsandiego.org',
  true,
  'https://feedingsandiego.org'
)
ON CONFLICT (domain) DO UPDATE
  SET name = EXCLUDED.name,
      is_verified = true;

-- Grant clewis1337@gmail.com network administrator rights (view and edit ALL posts)
INSERT INTO app_admins (user_id)
SELECT id FROM auth.users WHERE lower(email) = 'clewis1337@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
```

After running this, any user who signs in with an `@sandiegofoodbank.org` or
`@feedingsandiego.org` email address will be **automatically added** as a member
of the matching org by the `handle_auth_callback` RPC — no manual approval needed.

---

## Step 2 — Configure Resend as Supabase's custom SMTP

Supabase will route all auth emails (magic links, password resets, confirmations)
through Resend's SMTP gateway.

1. Go to **Supabase Dashboard → Authentication → SMTP Settings** (under "Email Settings").
2. Toggle **"Enable Custom SMTP"** on.
3. Enter the following:

| Field | Value |
|---|---|
| **Sender name** | East County Food Network |
| **Sender email** | `no-reply@foodresourcenetwork.org` *(or your verified Resend domain)* |
| **SMTP Host** | `smtp.resend.com` |
| **SMTP Port** | `465` |
| **SMTP Username** | `resend` |
| **SMTP Password** | `YOUR_RESEND_API_KEY` *(stored in .env as `RESEND_API_KEY`)* |

> **Note:** Resend's SMTP gateway requires a verified sending domain. If you haven't
> verified a domain yet, go to resend.com → Domains → Add Domain, and add your domain
> (e.g. `foodresourcenetwork.org`). Until then you can use `onboarding@resend.dev`
> as the sender email for testing only.

4. Click **Save**.
5. Use **"Send test email"** to verify delivery.

---

## How it works (end-to-end)

```
User enters @sandiegofoodbank.org email on /login
         ↓
supabase.auth.signInWithOtp() called
         ↓
Supabase sends magic-link email via Resend SMTP
         ↓
User clicks link → redirected to /auth/callback
         ↓
handle_auth_callback RPC runs:
  • Looks up organizations WHERE domain = 'sandiegofoodbank.org' AND is_verified = true
  • Inserts a row into organization_members linking user ↔ SD Food Bank org
         ↓
User lands on /admin and sees SD Food Bank's posts
```

No password, no approval queue — just click the link.

---

## Eligible domains (matches LoginPage.jsx)

| Email domain | Org granted access to |
|---|---|
| `@sandiegofoodbank.org` | San Diego Food Bank |
| `@feedingsandiego.org` | Feeding San Diego |

To add more orgs in the future:
1. Add their row to `organizations` with `is_verified = true` and their domain.
2. Add their domain to the `MAGIC_SSO_ORGS` array in `src/pages/LoginPage.jsx`.

