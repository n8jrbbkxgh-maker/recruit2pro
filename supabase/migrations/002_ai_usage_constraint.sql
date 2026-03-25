-- Add database-level constraint as safety net for rate limiting race conditions
-- Allows count up to 55 (5 over limit) to handle burst races, while app enforces 50
ALTER TABLE ai_usage ADD CONSTRAINT ai_usage_count_max CHECK (count <= 55);
