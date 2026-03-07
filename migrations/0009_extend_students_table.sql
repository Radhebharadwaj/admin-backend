-- Migration 0009: Extend Students table for Google Sign-In

ALTER TABLE students ADD COLUMN avatar_url TEXT;
ALTER TABLE students ADD COLUMN google_id TEXT;
ALTER TABLE students ADD COLUMN last_login_at DATETIME;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_google_id ON students (google_id);
