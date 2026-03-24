CREATE TABLE dashboards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    widgets JSONB NOT NULL DEFAULT '[]',
    created_by UUID NOT NULL REFERENCES users(id),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dashboards_team ON dashboards(team_id);
CREATE INDEX idx_dashboards_default ON dashboards(team_id) WHERE is_default = TRUE;

-- Materialized view for daily event aggregation (refreshed by cron)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_events AS
SELECT
    DATE(timestamp) AS date,
    type,
    COUNT(*) AS event_count,
    COUNT(DISTINCT user_id) AS unique_users
FROM analytics_events
GROUP BY DATE(timestamp), type;

CREATE UNIQUE INDEX idx_mv_daily_events ON mv_daily_events(date, type);

-- Materialized view for user signup trends
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_signups AS
SELECT
    DATE(created_at) AS date,
    role,
    COUNT(*) AS signup_count
FROM users
GROUP BY DATE(created_at), role;

CREATE UNIQUE INDEX idx_mv_user_signups ON mv_user_signups(date, role);
