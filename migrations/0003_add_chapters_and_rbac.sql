

-- 1. Create chapters table
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  chapter_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  unit_name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- 2. Create optimized index for chapters
CREATE INDEX IF NOT EXISTS idx_chapters_subject_id ON chapters(subject_id);

-- 3. Recreate subject_resources table with chapter_id and CHECK constraint
CREATE TABLE subject_resources_new (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  chapter_id TEXT,
  category TEXT NOT NULL CHECK (category IN ('ASSIGNMENT', 'PROJECT', 'PYQ', 'SHORTNOTES', 'SOLUTION', 'VIDEO_LECTURE', 'EBOOK_MODULE')),
  title TEXT NOT NULL,
  r2_object_key TEXT NOT NULL,
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

-- 4. Copy existing data into the new table
INSERT INTO subject_resources_new 
  (id, subject_id, chapter_id, category, title, r2_object_key, is_public, price_in_inr, free_after_date, valid_from, submission_deadline, academic_year, is_active, created_at)
SELECT 
  id, subject_id, NULL, category, title, r2_object_key, is_public, price_in_inr, free_after_date, valid_from, submission_deadline, academic_year, is_active, created_at
FROM subject_resources;

-- 5. Drop old table
DROP TABLE subject_resources;

-- 6. Rename new table to original name
ALTER TABLE subject_resources_new RENAME TO subject_resources;

-- 7. Recreate indexes for subject_resources
CREATE INDEX IF NOT EXISTS idx_subject_resources_subject_id ON subject_resources(subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_resources_chapter_id ON subject_resources(chapter_id);


