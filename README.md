# Food Network MVP

A mobile-first web application that displays a scrolling feed of food resources (food banks, distributions, meal services) across San Diego County.

## Tech Stack
* **Frontend:** React + Vite
* **Styling:** Tailwind CSS (v4)
* **Backend:** Supabase (PostgreSQL, Auth, Storage)
* **Routing:** React Router DOM
* **Icons:** Lucide React
* **Date Formatting:** date-fns

## Project Structure

```
food-network/
├── public/                 # Static assets
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── FilterBar.jsx   # Horizontal scrolling category filter
│   │   └── PostCard.jsx    # Individual food resource display card
│   ├── hooks/              # Custom React hooks
│   │   └── usePosts.js     # Supabase data fetching logic
│   ├── pages/              # Page components
│   │   ├── Admin.jsx       # Simple form to add new resources to Supabase
│   │   └── Home.jsx        # Main feed displaying food resources
│   ├── supabase.js         # Supabase client configuration
│   ├── App.jsx             # Main application component & routing (Currently modified for connection testing)
│   ├── main.jsx            # Application entry point
│   └── index.css           # Global styles and Tailwind configuration
├── .env                    # Environment variables (Supabase keys)
├── supabase-schema.sql     # Database schema, table definitions, and RLS policies
└── vite.config.js          # Vite build and tailwind plugin configuration
```

## Features Implemented
* **Mobile-First Feed:** A responsive, scannable list of food resources with essential details (time, location, tags).
* **Category Filtering:** Filter resources by type (e.g., Groceries, Hot Meals).
* **Get Directions:** Direct integration linking resource addresses to Google Maps.
* **Database Schema:** Fully defined PostgreSQL schema for `organizations` and `posts` with Row Level Security.
* **Admin Page:** Simple interface for creating new posts and uploading images directly to Supabase storage.

## Routes

| Path | Access | Description |
|---|---|---|
| `/` | Public | Feed of active, published food resources + map |
| `/widget` | Public / iframe | Embeddable event list (no auth, no map) |
| `/login` | Public | Magic-link sign-in |
| `/auth/callback` | Public | Supabase auth redirect handler |
| `/organization-request` | Authenticated | Request access for unverified domains |
| `/admin` | Org members + App admins | Create/edit/delete posts |
| `/admin/pending-providers` | App admins only | Approve or reject provider requests |

---

## Authentication — Magic-Link Login

Users sign in by entering their email address. Supabase sends a one-time magic link; no password is required.

```
Provider types their email  →  magic link sent
User clicks link            →  /auth/callback
Callback calls handle_auth_callback() RPC (server-side, SECURITY DEFINER)
  ├── domain matches a verified org  →  org_members row created  →  redirect /admin
  └── domain does not match          →  pending_organizations row created  →  redirect /organization-request
```

**Security note:** Organization assignment happens inside a Postgres `SECURITY DEFINER` function (`handle_auth_callback`). The frontend cannot manipulate which organization a user is assigned to — the match is performed entirely in the database using the email stored in `auth.users`.

---

## Verified Domain Matching

When a user signs in, the server extracts the domain from their email (e.g. `@feedingsandiego.org`) and looks for a row in `organizations` where:

```sql
domain = 'feedingsandiego.org' AND is_verified = true
```

If found, the user is automatically added to `organization_members` for that org.

**To add or verify an organization domain** (run in Supabase SQL Editor):

```sql
-- Add a new verified org
INSERT INTO organizations (name, domain, is_verified)
VALUES ('Feeding San Diego', 'feedingsandiego.org', true);

-- Or verify an existing org
UPDATE organizations
SET domain = 'feedingsandiego.org', is_verified = true
WHERE name = 'Feeding San Diego';
```

---

## Pending Provider Workflow

If a user's domain does not match any verified organization:

1. A row is created in `pending_organizations` (idempotent — only one pending row per user).
2. The user sees `/organization-request` where they can submit their organization's name, website, phone, and notes.
3. An app admin reviews the request at `/admin/pending-providers`.
4. On **approval**: the admin confirms the org name and domain, the `approve_pending_org()` RPC creates the `organizations` row (or updates an existing one), sets `is_verified = true`, and adds the user as `owner`.
5. On **rejection**: the request is marked `rejected` and the user is notified.

---

## How to Add an App Admin

App admins can approve pending providers, see all posts, and manage all organizations.

```sql
-- Find the user's UUID after they have signed in at least once
SELECT id, email FROM auth.users WHERE email = 'admin@yourorg.org';

-- Grant app admin access
INSERT INTO app_admins (user_id) VALUES ('<paste-uuid-here>');
```

---

## Setup Instructions

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   Ensure your `.env` file is present in the root directory and contains your Supabase credentials.

3. **Database Setup**
   Copy the contents of `supabase-schema.sql` and run it in your Supabase project's SQL Editor. It creates all tables, RLS policies, helper functions, storage bucket, and RPC functions in one shot. Safe to re-run.

4. **Run Locally**
   ```bash
   npm run dev
   ```

5. **Deployment**
   The application is configured to be deployed easily via Netlify.
   * **Build Command:** `npm run build`
   * **Publish Directory:** `dist`
