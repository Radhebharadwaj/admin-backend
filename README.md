# QuduHub Admin Backend Architecture 🚀

Welcome to the QuduHub Admin Backend. This repository powers the core administrative operations, content management, and global search functionality for the QuduHub platform.

This backend is architected for **high concurrency, extreme edge performance, and zero-bloat storage**.

## 1. System Architecture & Tech Stack

This backend runs entirely on the edge, pushing compute and data as close to the user as possible. 

### Core Technologies
- **Compute:** [Cloudflare Workers](https://developers.cloudflare.com/workers/) (V8 isolates running at the edge).
- **Database:** [Cloudflare D1](https://developers.cloudflare.com/d1/) (Distributed Serverless SQLite).
- **ORM:** [Drizzle ORM](https://orm.drizzle.team/) (Type-safe SQL schema management).
- **Storage:** [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible blob storage with custom CDN domain `cdn.qudu.in`).
- **Web Framework:** [Hono](https://hono.dev/) (Ultrafast web framework designed for edge environments).
- **Search Engine:** SQLite FTS5 Virtual Tables combined with Cloudflare Edge Cache.

### Distributed Edge Architecture
Every HTTP request hits a Cloudflare Edge node near the user. Static and frequently read data (like Search) is served directly from RAM (Cache API). Mutations (POST/PATCH/DELETE) execute directly on the Worker and commit to the globally distributed D1 database, while heavy operations (like deleting massive amounts of orphan images from R2 or syncing search indexes) are offloaded to background execution contexts using `c.executionCtx.waitUntil()`, ensuring the API always responds in milliseconds.

---

## 2. Database Schema & FTS5 Engine (Deep Dive)

The core relational database schema is defined in `src/db/schema.ts` and managed via Drizzle ORM.

### Core Relational Models
- **Universities (`universities`)**: The top-level hierarchy.
- **Courses (`courses`)**: Academic programs belonging to a university.
- **Subjects (`subjects`)**: Specific subjects within a course semester.
- **Chapters (`chapters`)**: Organizational units for a subject.
- **Resources (`subject_resources`)**: The actual content (Rich text notes, PDFs, PYQs, videos). Contains deep relations, pricing, and media URLs.
- **Bundles & Purchases**: Tables managing student transactions and bundled resources.

### The FTS5 Global Search Engine
Because standard SQL `LIKE` queries become a bottleneck at scale, we implemented a dedicated **FTS5 Virtual Table** (`global_search_index`).

- **Table Structure:** `id`, `entity_type`, `title`, `subtitle`, and `search_terms`.
- **Search Terms Aggregation:** We concatenate names, acronyms, and aliases into `search_terms` for single-query, sub-millisecond full-text matching.
- **Background Syncing:** Drizzle does not natively support FTS5 triggers. Instead, the `universities`, `courses`, and `subjects` POST/PATCH/DELETE API routes manually sync the FTS5 index. To prevent blocking the API response, we wrap these `upsertSearchIndex()` calls inside Cloudflare's `c.executionCtx.waitUntil()`. 
- **High-Performance Edge Caching:** The `/api/search` route intercepts GET requests and checks `caches.default` (Edge RAM). If the query was searched recently, it returns instantly (sub-10ms). Cache misses hit D1 via the `MATCH` operator, and the response is cached using `Cache-Control: public, max-age=300, s-maxage=300` (5 minutes).

---

## 3. API Endpoints & Data Flow

All route controllers are isolated inside the `src/routes/` directory.

| Route File | Base Path | Description & Data Flow |
| :--- | :--- | :--- |
| `universities.ts` | `/api/universities` | CRUD for universities. Triggers FTS5 background sync on modifications. |
| `courses.ts` | `/api/courses` | CRUD for courses. Requires `university_id`. Triggers FTS5 background sync. |
| `subjects.ts` | `/api/subjects` | CRUD for subjects. Performs deep **Cascading R2 Wipes** (Nuclear Wipe) before deleting rows to prevent storage bloat. |
| `chapters.ts` | `/api/chapters` | CRUD for chapters. Also performs cascading R2 wipes for all child resources on deletion. |
| `resources.ts` | `/api/resources` | Manages core content. Includes **Deep JSON Diffing** on updates. It compares old vs new Tiptap JSON content and silently queues background R2 deletes for removed images. |
| `search.ts` | `/api/search` | The global search API. Includes edge caching logic and an Admin-only `/api/search/seed` endpoint for bulk index hydration. |
| `upload.ts` | `/api/upload` | Handles direct `multipart/form-data` uploads to Cloudflare R2, returning custom `cdn.qudu.in` CDN URLs. |
| `analytics.ts` | `/api/analytics` | Aggregates D1 data for admin dashboard charts and metrics. |
| `payments.ts` | `/api/payments` | Integration with Razorpay for generating orders and verifying signatures. |
| `team.ts` | `/api/team` | Internal admin/staff management routing. |
| `student.ts`, `public.ts` | Various | Read-only or student-facing endpoints with specialized access control. |

---

## 4. Background Workers & CRON Jobs

### Zero-Bloat Garbage Collection (`src/utils/cron.ts`)
When admins draft content, they often upload images to R2 but hit "Cancel" before saving the resource to the database. These files become orphaned.
- **Trigger:** Cloudflare Scheduled Event defined in `wrangler.jsonc` as `"crons": ["0 0 * * *"]` (Runs every day at Midnight UTC).
- **Action:** The CRON job parses the entire D1 database to build a master Set of active media keys. It then paginates through the entire R2 bucket. Any file older than 24 hours that is *not* in the active database Set is permanently deleted in batches.

---

## 5. Utility Functions & Middlewares

- **`searchIndex.ts`**: Contains `upsertSearchIndex`, `deleteSearchIndex`, `deleteCascadeSearchIndex`, and entity builder functions to structure raw relational data into the FTS5 format.
- **`mediaSync.ts`**: The engine behind the Zero-Bloat architecture. Contains `extractMediaKeys()` and `findOrphanedKeys()`. It recursively parses Tiptap Rich Text JSON objects to find embedded R2 image/video URLs. Supports both proxy and custom CDN domains (`cdn.qudu.in`).
- **`index.ts` (Core App)**: Mounts all sub-routers, sets strict CORS policies allowing only specific domains, and registers the global `scheduled` event listener for the CRON job.

---

## 6. Local Setup & Development

### Prerequisites
Make sure you have `pnpm` installed and are authenticated with Cloudflare (`pnpm wrangler login`).

### Installation
```bash
pnpm install
```

### Environment Setup
Create a `.dev.vars` file in the root directory for local secrets:
```env
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key
ROOT_ADMIN_EMAIL=admin@quduhub.com
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=secret_xxxx
```
*(Note: Cloudflare resource bindings like `DB` and `BUCKET`, as well as `PUBLIC_R2_URL` are configured in `wrangler.jsonc`)*

### Database Migrations
Drizzle ORM manages the core schema. The FTS5 table is raw SQL.

**Local (Development):**
```bash
# Apply standard Drizzle schema
pnpm wrangler d1 migrations apply quduhub-database --local
# Apply FTS5 virtual table
pnpm wrangler d1 execute quduhub-database --local --file=./drizzle/0001_fts5_global_search.sql
```

**Remote (Production):**
```bash
pnpm wrangler d1 migrations apply quduhub-database --remote
pnpm wrangler d1 execute quduhub-database --remote --file=./drizzle/0001_fts5_global_search.sql
```

### Running the Local Dev Server
```bash
pnpm wrangler dev
```

---

## 7. Deployment

Deploying the backend to the Cloudflare global edge network is handled entirely by Wrangler. 
Ensure you have authenticated locally, then run:

```bash
pnpm run deploy
```
*(This maps to `wrangler deploy` in your `package.json` scripts).*

Once deployed, the backend will scale automatically, routing database reads to the nearest D1 node and caching FTS5 search queries directly in edge RAM worldwide.