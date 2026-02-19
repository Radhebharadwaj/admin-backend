PRAGMA foreign_keys = OFF;

-- 1. Universities Table
CREATE TABLE IF NOT EXISTS universities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  website_url TEXT,
  logo_url TEXT,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Courses Table
CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  university_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  duration_years INTEGER,
  total_semesters INTEGER NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(university_id) REFERENCES universities(id) ON DELETE CASCADE,
  UNIQUE(university_id, slug)
);

-- 3. Subjects Table
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  subject_code TEXT NOT NULL,
  name TEXT NOT NULL,
  course_id TEXT NOT NULL,
  semester INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE(course_id, semester, subject_code)
);

-- 4. Subject Resources Table
CREATE TABLE IF NOT EXISTS subject_resources (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  category TEXT NOT NULL,
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
  FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- 5. Create optimized indexes
CREATE INDEX IF NOT EXISTS idx_courses_university_id ON courses(university_id);
CREATE INDEX IF NOT EXISTS idx_subjects_course_id ON subjects(course_id);
CREATE INDEX IF NOT EXISTS idx_subjects_subject_code ON subjects(subject_code);
CREATE INDEX IF NOT EXISTS idx_subject_resources_subject_id ON subject_resources(subject_id);

PRAGMA foreign_keys = ON;
