-- FTS5 Virtual Table for Global Search
-- Note: Drizzle ORM does not support FTS5 virtual tables natively.
-- This is a raw SQL migration that must be applied manually via wrangler d1 execute.

-- Create the FTS5 virtual table
CREATE VIRTUAL TABLE IF NOT EXISTS global_search_index USING fts5(
  id UNINDEXED,
  entity_type UNINDEXED,
  title,
  subtitle,
  search_terms,
  content='',
  contentless_delete=1
);
