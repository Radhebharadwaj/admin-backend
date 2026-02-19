# 🧠 QuduHub Admin Backend (Hono Worker)
**The Ultimate Gatekeeper: RBAC, Data Fencing, and Security**

## 🏗️ 1. Architecture Overview
This is a Cloudflare Worker built with Hono.js. It acts as the secure bridge between the Admin Frontend and the platform's infrastructure (D1, R2, Supabase). It enforces strict Role-Based Access Control (RBAC) and handles file streams.

## 🔐 2. Zero-Trust RBAC & The "God Mode"
Every route must pass through an authentication middleware that verifies the Supabase JWT and queries the `team_members` table for roles.

### Role Definitions & Database Fencing
*   **FOUNDER (Root Admin):** Has absolute access. Hardcoded safeguard: The Founder's email/ID can NEVER be modified, demoted, or deleted by anyone, even another Super Admin.
*   **SUPER_ADMIN:** Can view Supabase financial data (payments, status, user emails), upload content (D1/R2), and manage standard team members.
*   **EDITOR:** Can ONLY upload and edit content (D1/R2) based on their assigned scope (e.g., IGNOU). Any attempt to access `/api/revenue` or upload outside their scope returns a `403 Forbidden`.

### Supabase Boundary (Read-Only for PII)
*   The Worker can query the Supabase `purchases` table to calculate revenue and display payment statuses (Success/Pending) to Super Admins.
*   **Strict Rule:** The Worker NEVER exposes endpoints to modify user passwords, edit student profiles, or export raw student data.

## 🗄️ 3. Operations & Integrations
*   **Catalog Management:** Reads and writes to Cloudflare D1 (`universities`, `courses`, `subjects`, `assignment_metadata`).
*   **Secure Uploads:** Receives `multipart/form-data`. Validates magic bytes (PDFs) and Zod Schemas (JSON). Generates a random UUID filename and securely puts the object into Cloudflare R2.
*   **Audit Logging:** Mutating actions are queued via Cloudflare Queues to be asynchronously logged into Supabase `admin_audit_logs`.

## 🛡️ 4. Security Measures
*   **CORS:** Strictly restricted to the Admin Frontend URL (e.g., `https://admin.quduhub.com`).
*   **Rate Limiting:** Protects upload endpoints using Cloudflare Durable Objects to prevent storage abuse.

## 🚀 5. Environment Variables & Secrets
Requires `wrangler.toml` and `.dev.vars`:
*   `DB` (D1 Binding), `BUCKET` (R2 Binding).
*   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Used for verifying team members and reading purchases securely).
*   `FOUNDER_EMAIL` (For the God Mode safeguard).