CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reminders_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
);

CREATE TABLE IF NOT EXISTS expense_participants (
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  share_amount INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (expense_id, participant_id)
);

CREATE TABLE IF NOT EXISTS expense_line_items (
  id TEXT PRIMARY KEY,
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

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
);
