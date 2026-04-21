-- Migration 013: Add username to profiles for username-based login
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE guards)

-- Add username column
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

-- Unique index — two staff members can't share a username
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_idx ON profiles (username)
  WHERE username IS NOT NULL;

-- Backfill existing rows: derive username from the part before @ in their email
-- This gives the existing admin a default username they can change later
UPDATE profiles
  SET username = split_part(email, '@', 1)
  WHERE username IS NULL
    AND email IS NOT NULL
    AND email NOT LIKE '%@staff.heavens';
