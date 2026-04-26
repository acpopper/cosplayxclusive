-- ── Per-post media moderation results ───────────────────────────────────────
-- Stores the full SightEngine response for every image in a post (flagged or
-- not). The existing `image_content_flags` table only records images that
-- exceeded a threshold; this column lets admins inspect the raw scores for
-- ANY image — useful for tuning thresholds and debugging false negatives.
--
-- Shape: jsonb array, one entry per index in posts.media_paths:
--   [{
--     index:      0,
--     type:       'image' | 'video',
--     scanned:    true | false,
--     flagged:    boolean,
--     categories: text[],         -- e.g. ['nudity:erotica']
--     max_score:  float,
--     scores:     { nudity: {...} }   -- raw SightEngine response
--   }, ...]
--
-- Videos are stored with scanned=false (we don't run SightEngine on them).
-- Column is only read by admin tooling — never fetched by the feed/profile.

alter table posts
  add column if not exists media_moderation jsonb;
