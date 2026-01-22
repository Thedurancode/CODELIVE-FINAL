-- Fix the syndication column type issue
ALTER TABLE properties ALTER COLUMN syndication DROP DEFAULT;
ALTER TABLE properties ALTER COLUMN syndication DROP NOT NULL;
ALTER TABLE properties ALTER COLUMN syndication TYPE TEXT[] USING syndication::TEXT[];
