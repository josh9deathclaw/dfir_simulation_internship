-- Add file_name column to injects table.
-- This stores the original filename chosen by the teacher (e.g. "perimeter_capture.pcap")
-- separately from file_path (which is the server storage path with a timestamp prefix).
-- Safe to run multiple times — the IF NOT EXISTS guard prevents errors on re-run.
 
ALTER TABLE injects
    ADD COLUMN IF NOT EXISTS file_name VARCHAR(255);
 
-- Backfill existing rows: derive file_name from the last segment of file_path.
-- e.g. "uploads/scenarios/abc/1773376342349_vde02ggk.jpg" → "1773376342349_vde02ggk.jpg"
-- This won't be the original filename, but it's better than null.
-- You can manually update specific rows in psql if you want clean names.
UPDATE injects
SET file_name = SPLIT_PART(file_path, '/', -1)
WHERE file_name IS NULL AND file_path IS NOT NULL;