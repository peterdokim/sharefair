import "server-only";

import { neon } from "@neondatabase/serverless";
import { Redis } from "@upstash/redis";

let sqlClient = null;
let redisClient = null;
let schemaReadyPromise = null;

function getRedisCredentials() {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "",
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || ""
  };
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function isRedisConfigured() {
  const credentials = getRedisCredentials();
  return Boolean(credentials.url && credentials.token);
}

export function getStorageProfile() {
  return {
    database: isDatabaseConfigured() ? "neon-postgres" : "local-file",
    redis: isRedisConfigured() ? "upstash-redis" : "in-memory"
  };
}

export function getSql() {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured.");
  }

  if (!sqlClient) {
    sqlClient = neon(process.env.DATABASE_URL);
  }

  return sqlClient;
}

export function getRedis() {
  if (!isRedisConfigured()) {
    throw new Error("Upstash Redis credentials are not configured.");
  }

  if (!redisClient) {
    const credentials = getRedisCredentials();
    redisClient = new Redis({
      url: credentials.url,
      token: credentials.token
    });
  }

  return redisClient;
}

async function createSchema() {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reminders_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`ALTER TABLE participants ADD COLUMN IF NOT EXISTS email TEXT`;

  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      paid_by TEXT NOT NULL REFERENCES participants(id),
      split_type TEXT NOT NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS expense_participants (
      expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      share_amount INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (expense_id, participant_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS expense_line_items (
      id TEXT PRIMARY KEY,
      expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      from_participant_id TEXT NOT NULL REFERENCES participants(id),
      to_participant_id TEXT NOT NULL REFERENCES participants(id),
      amount INTEGER NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL,
      reference TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      confirmed_at TIMESTAMPTZ,
      authorization_session_id TEXT,
      state_nonce TEXT,
      idempotency_key TEXT,
      redirect_url TEXT,
      authorization_status TEXT,
      authorization_expires_at TIMESTAMPTZ,
      authorized_actor_id TEXT REFERENCES participants(id),
      provider_transaction_id TEXT,
      verified_at TIMESTAMPTZ,
      step_up_required BOOLEAN NOT NULL DEFAULT FALSE,
      step_up_challenge_id TEXT,
      step_up_masked_email TEXT,
      step_up_expires_at TIMESTAMPTZ,
      step_up_attempts_remaining INTEGER NOT NULL DEFAULT 0,
      step_up_status TEXT,
      step_up_verified_at TIMESTAMPTZ,
      debug_step_up_code TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS settlement_requests (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
      expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      expense_title TEXT NOT NULL,
      expense_category TEXT NOT NULL,
      from_participant_id TEXT NOT NULL REFERENCES participants(id),
      to_participant_id TEXT NOT NULL REFERENCES participants(id),
      amount INTEGER NOT NULL,
      due_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      settled_at TIMESTAMPTZ,
      initial_sent_at TIMESTAMPTZ,
      reminder_3h_sent_at TIMESTAMPTZ,
      reminder_15m_sent_at TIMESTAMPTZ
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS participants_trip_id_idx ON participants(trip_id)`;
  await sql`CREATE INDEX IF NOT EXISTS expenses_trip_id_idx ON expenses(trip_id)`;
  await sql`CREATE INDEX IF NOT EXISTS expense_participants_expense_id_idx ON expense_participants(expense_id)`;
  await sql`CREATE INDEX IF NOT EXISTS expense_line_items_expense_id_idx ON expense_line_items(expense_id)`;
  await sql`CREATE INDEX IF NOT EXISTS payments_trip_id_idx ON payments(trip_id)`;
  await sql`CREATE INDEX IF NOT EXISTS settlement_requests_trip_id_idx ON settlement_requests(trip_id)`;
}

export async function ensureDatabaseSchema() {
  if (!isDatabaseConfigured()) {
    return false;
  }

  if (!schemaReadyPromise) {
    schemaReadyPromise = createSchema();
  }

  await schemaReadyPromise;
  return true;
}
