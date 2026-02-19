-- Migration 0004: Add external_url, thumbnail_url, description to subject_resources
-- Also makes r2_object_key optional by defaulting to empty string.
-- Note: These columns have already been added to production D1 via console.
-- This migration keeps local dev and Git in sync.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- Recreate subject_resources with the new columns and r2_object_key defaulting to ''
CREATE TABLE subject_resources_new (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  chapter_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('ASSIGNMENT', 'PROJECT', 'PYQ', 'SHORTNOTES', 'SOLUTION', 'VIDEO_LECTURE', 'EBOOK_MODULE')),
  title TEXT NOT NULL,
  r2_object_key TEXT DEFAULT '',
  external_url TEXT,
  thumbnail_url TEXT,
  description TEXT,
  is_public INTEGER DEFAULT 0,
  price_in_inr INTEGER DEFAULT 0,
  free_after_date DATETIME,
  valid_from DATETIME,
  submission_deadline DATETIME,
  academic_year TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  FOREIGN KEY(chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
);

-- Copy existing data
INSERT INTO subject_resources_new
  (id, subject_id, chapter_id, category, title, r2_object_key, is_public, price_in_inr, free_after_date, valid_from, submission_deadline, academic_year, is_active, created_at)
SELECT
  id, subject_id, chapter_id, category, title, COALESCE(r2_object_key, ''), is_public, price_in_inr, free_after_date, valid_from, submission_deadline, academic_year, is_active, created_at
FROM subject_resources;

-- Drop old table
DROP TABLE subject_resources;

-- Rename new table
ALTER TABLE subject_resources_new RENAME TO subject_resources;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_subject_resources_subject_id ON subject_resources(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_resources_chapter_id ON subject_resources(chapter_id);

COMMIT;

PRAGMA foreign_keys = ON;
