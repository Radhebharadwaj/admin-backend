-- Migration 0006: Add Students and Purchases tables for Phase 3 Authentication and Monetization

-- Students table (matches Supabase Auth UUID)
CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Purchases table to track resource ownership
CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES students(id),
    resource_id TEXT NOT NULL REFERENCES subject_resources(id),
    amount INTEGER NOT NULL, -- The original price in INR
    amount_in_paise INTEGER NOT NULL, -- Stored as processed by gateway
    currency TEXT DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'PENDING', -- COMPLETED, PENDING, FAILED
    gateway_order_id TEXT,
    gateway_payment_id TEXT,
    access_expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup when checking paywall access
CREATE INDEX IF NOT EXISTS idx_purchases_student_resource ON purchases (student_id, resource_id);
