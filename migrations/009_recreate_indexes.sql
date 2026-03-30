-- Hotfix: recreate indexes dropped during database refactor (PR #2)
-- Ref: Issue #51 — seq scan on users.email causing 2s+ API latency

-- Recreate concurrently to avoid locking the table during migration
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email
  ON users(email);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role
  ON users(role);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_timestamp
  ON analytics_events(timestamp);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_user_id
  ON analytics_events(user_id)
  WHERE user_id IS NOT NULL;

-- Verify
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'users' AND indexname = 'idx_users_email'
  ) THEN
    RAISE EXCEPTION 'Index idx_users_email was not created successfully';
  END IF;
END$$;
