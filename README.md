# SN Web Design CRM

Internal CRM for **SN Web Design** — leads, deals, clients, projects, deliverable review, contracts, and invoices.

## Stack

- Next.js (App Router) + TypeScript
- Clerk (auth + invites)
- Supabase (Postgres + Storage)
- Stripe Checkout (invoice payments)
- Tailwind CSS

## Roles

| Role | Access |
|------|--------|
| **Owner** | Full CRM + Team invites |
| **Sales** | Own leads/deals, convert won deals, assigned projects |
| **Client** | Client portal only |

## Setup (required keys)

Copy `.env.example` → `.env.local` and fill these in:

### 1. Clerk (required) — https://dashboard.clerk.com
| Variable | Where |
|----------|--------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | API Keys → Publishable key |
| `CLERK_SECRET_KEY` | API Keys → Secret key |
| `CLERK_WEBHOOK_SECRET` | Optional — Webhooks → signing secret for `/api/webhooks/clerk` |

Also set the first user's `publicMetadata.role` to `"owner"` in Clerk (or sign up first — first DB user becomes owner).

### 2. Supabase (required) — https://supabase.com/dashboard
| Variable | Where |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` (keep secret) |

Then:
1. Run [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql) in the SQL Editor  
2. Create Storage buckets: `deliverables` and `contracts` (make them public, or adjust upload code for signed URLs)

### 3. Stripe (required for invoice pay) — https://dashboard.stripe.com
| Variable | Where |
|----------|--------|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Developers → API keys → Publishable |
| `STRIPE_SECRET_KEY` | Developers → API keys → Secret |
| `STRIPE_WEBHOOK_SECRET` | Webhooks → endpoint `/api/webhooks/stripe` → `checkout.session.completed` |

Local webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

### 4. App URL
| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` (or your production URL) |

```bash
npm install
npm run dev
```

## Optional demo mode

Set `NEXT_PUBLIC_DEMO_MODE=true` only if you want the local JSON store again (no keys). Leave it `false` for production.

## App routes

- `/crm/*` — staff CRM
- `/portal/*` — client portal
- `/sign-in`, `/sign-up` — Clerk

## Lifecycle

1. Sales creates **leads** → pipeline kanban  
2. Opens **deals** → mark won → creates **client** (+ optional project + portal invite)  
3. Staff upload **deliverables** → client **feedback / approve**  
4. **Contracts** sent → e-sign in portal  
5. **Invoices** → Stripe Checkout → webhook marks paid  
