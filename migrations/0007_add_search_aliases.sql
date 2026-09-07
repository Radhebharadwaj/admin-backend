-- Migration 0007: Add Search Aliases for optimized filtering
ALTER TABLE universities ADD COLUMN search_aliases TEXT DEFAULT '';
ALTER TABLE courses ADD COLUMN search_aliases TEXT DEFAULT '';
ALTER TABLE subjects ADD COLUMN search_aliases TEXT DEFAULT '';
