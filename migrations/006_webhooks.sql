CREATE TABLE webhook_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret VARCHAR(64) NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    headers JSONB DEFAULT '{}',
    created_by UUID NOT NULL REFERENCES users(id),
    failure_count INT NOT NULL DEFAULT 0,
    last_triggered_at TIMESTAMPTZ,
    last_status_code INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_team ON webhook_registrations(team_id);
CREATE INDEX idx_webhooks_active ON webhook_registrations(team_id) WHERE active = TRUE;
CREATE INDEX idx_webhooks_events ON webhook_registrations USING gin(events);
CREATE UNIQUE INDEX idx_webhooks_team_url ON webhook_registrations(team_id, url);

CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL REFERENCES webhook_registrations(id) ON DELETE CASCADE,
    event VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    request_headers JSONB NOT NULL DEFAULT '{}',
    response_status INT,
    response_body TEXT,
    response_time_ms INT,
    attempt INT NOT NULL DEFAULT 1,
    max_attempts INT NOT NULL DEFAULT 5,
    success BOOLEAN NOT NULL DEFAULT FALSE,
    error TEXT,
    delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_deliveries_webhook ON webhook_deliveries(webhook_id);
CREATE INDEX idx_deliveries_event ON webhook_deliveries(event);
CREATE INDEX idx_deliveries_success ON webhook_deliveries(webhook_id, success);
CREATE INDEX idx_deliveries_delivered ON webhook_deliveries(delivered_at);

-- Partition by month for delivery history (high volume)
-- In production, use pg_partman or manual partitioning
