-- Migration 0012: Add pricing infrastructure to chapters table
-- Enables selling entire Chapters/Modules as premium content

ALTER TABLE chapters ADD COLUMN price_in_paise INTEGER DEFAULT 0;
