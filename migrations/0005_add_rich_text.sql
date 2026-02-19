-- Migration 0005: Add rich_text_content and content_type to subject_resources



-- Add content_type (defaults to 'external_url' for backward compatibility)
ALTER TABLE subject_resources ADD COLUMN content_type TEXT DEFAULT 'external_url';

-- Add rich_text_content for Internal Modules
ALTER TABLE subject_resources ADD COLUMN rich_text_content TEXT;


