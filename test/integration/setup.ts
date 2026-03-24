import { db } from "../../src/shared/database";

export default async function setup() {
  console.log("Setting up test database...");
  // Run migrations
  const migrations = [
    `CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(100) NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'member',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS analytics_events (
      id BIGSERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      metadata JSONB DEFAULT '{}',
      timestamp TIMESTAMPTZ DEFAULT NOW()
    )`,
  ];

  for (const sql of migrations) {
    await db.query(sql);
  }
  console.log("Test database ready");
}
