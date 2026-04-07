import "server-only";

import { randomUUID } from "node:crypto";
import { getExpenseShares } from "@/lib/trip-helpers";
import { readLocalState, updateLocalState } from "@/lib/server/local-data-store";
import { ensureDatabaseSchema, getSql, isDatabaseConfigured } from "@/lib/server/storage-runtime";

function createError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function createId(prefix) {
  return `${prefix}_${randomUUID()}`;
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function normalizeLineItems(lineItems) {
  if (!Array.isArray(lineItems)) {
    return [];
  }

  return lineItems
    .map((item, index) => ({
      id: item?.id || createId(`line_${index + 1}`),
      name: String(item?.name || "").trim(),
      amount: toNumber(item?.amount)
    }))
    .filter((item) => item.name && item.amount > 0);
}

function normalizeParticipants(participants) {
  if (!Array.isArray(participants)) {
    return [];
  }

  return participants
    .map((participant) => ({
      id: participant.id,
      name: String(participant.name || "").trim(),
      email: String(participant.email || "").trim().toLowerCase() || null
    }))
    .filter((participant) => participant.id && participant.name);
}

function normalizeParticipantInput(participant) {
  if (typeof participant === "string") {
    return {
      name: String(participant).trim(),
      email: ""
    };
  }

  return {
    name: String(participant?.name || "").trim(),
    email: String(participant?.email || "").trim().toLowerCase()
  };
}

function normalizeExpense(expense) {
  return {
    id: expense.id,
    title: String(expense.title || "").trim(),
    category: String(expense.category || "Food"),
    amount: toNumber(expense.amount),
    paidBy: expense.paidBy,
    participantIds: Array.isArray(expense.participantIds) ? expense.participantIds.filter(Boolean) : [],
    splitType: expense.splitType === "custom" ? "custom" : "equal",
    customShares: expense.splitType === "custom" ? expense.customShares || {} : undefined,
    notes: String(expense.notes || "").trim(),
    lineItems: normalizeLineItems(expense.lineItems),
    createdAt: expense.createdAt || new Date().toISOString()
  };
}

function normalizePayment(payment) {
  return {
    id: payment.id,
    fromParticipantId: payment.fromParticipantId,
    toParticipantId: payment.toParticipantId,
    amount: toNumber(payment.amount),
    provider: payment.provider,
    status: payment.status || "pending",
    reference: payment.reference || "UNSET",
    createdAt: payment.createdAt || new Date().toISOString(),
    confirmedAt: payment.confirmedAt || null,
    authorizationSessionId: payment.authorizationSessionId || null,
    stateNonce: payment.stateNonce || null,
    idempotencyKey: payment.idempotencyKey || null,
    redirectUrl: payment.redirectUrl || null,
    authorizationStatus: payment.authorizationStatus || null,
    authorizationExpiresAt: payment.authorizationExpiresAt || null,
    authorizedActorId: payment.authorizedActorId || null,
    providerTransactionId: payment.providerTransactionId || null,
    verifiedAt: payment.verifiedAt || null,
    stepUpRequired: Boolean(payment.stepUpRequired),
    stepUpChallengeId: payment.stepUpChallengeId || null,
    stepUpMaskedEmail: payment.stepUpMaskedEmail || null,
    stepUpExpiresAt: payment.stepUpExpiresAt || null,
    stepUpAttemptsRemaining: Number(payment.stepUpAttemptsRemaining || 0),
    stepUpStatus: payment.stepUpStatus || null,
    stepUpVerifiedAt: payment.stepUpVerifiedAt || null,
    debugStepUpCode: null
  };
}

function normalizeTrip(trip) {
  return {
    id: trip.id,
    name: String(trip.name || "").trim(),
    location: String(trip.location || "").trim(),
    startDate: trip.startDate || "",
    endDate: trip.endDate || "",
    remindersSentAt: trip.remindersSentAt || null,
    participants: normalizeParticipants(trip.participants),
    expenses: Array.isArray(trip.expenses) ? trip.expenses.map(normalizeExpense).sort(sortByCreatedDesc) : [],
    payments: Array.isArray(trip.payments) ? trip.payments.map(normalizePayment).sort(sortByCreatedDesc) : []
  };
}

function sortByCreatedDesc(left, right) {
  return new Date(right.createdAt || right.confirmedAt || 0) - new Date(left.createdAt || left.confirmedAt || 0);
}

function validateTripInput(input) {
  const name = String(input?.name || "").trim();
  const location = String(input?.location || "").trim();
  const startDate = String(input?.startDate || "").trim();
  const endDate = String(input?.endDate || "").trim();
  const participants = (input?.participants || [])
    .map(normalizeParticipantInput)
    .filter((participant) => participant.name);

  if (!name) {
    throw createError(400, "Trip name is required.");
  }

  if (!location) {
    throw createError(400, "Location is required.");
  }

  if (!startDate || !endDate) {
    throw createError(400, "Trip dates are required.");
  }

  if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
    throw createError(400, "End date cannot be earlier than the start date.");
  }

  const dedupedParticipants = participants.filter(
    (participant, index, collection) =>
      collection.findIndex(
        (entry) => entry.name.toLowerCase() === participant.name.toLowerCase() && entry.email === participant.email
      ) === index
  );

  if (dedupedParticipants.length < 2) {
    throw createError(400, "Add at least two travelers.");
  }

  for (const participant of dedupedParticipants) {
    if (participant.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(participant.email)) {
      throw createError(400, `The email for ${participant.name} is not valid.`);
    }
  }

  return {
    name,
    location,
    startDate,
    endDate,
    participants: dedupedParticipants
  };
}

function validateExpenseInput(trip, input) {
  const title = String(input?.title || "").trim();
  const category = String(input?.category || "Food").trim();
  const amount = toNumber(input?.amount);
  const paidBy = input?.paidBy;
  const participantIds = Array.isArray(input?.participantIds) ? [...new Set(input.participantIds.filter(Boolean))] : [];
  const splitType = input?.splitType === "custom" ? "custom" : "equal";
  const notes = String(input?.notes || "").trim();
  const lineItems = normalizeLineItems(input?.lineItems);
  const validParticipantIds = new Set(trip.participants.map((participant) => participant.id));

  if (!title) {
    throw createError(400, "Expense title is required.");
  }

  if (!amount) {
    throw createError(400, "Expense amount must be greater than zero.");
  }

  if (!validParticipantIds.has(paidBy)) {
    throw createError(400, "Paid by must belong to this trip.");
  }

  if (!participantIds.length) {
    throw createError(400, "Select at least one participant.");
  }

  if (!participantIds.every((participantId) => validParticipantIds.has(participantId))) {
    throw createError(400, "One or more selected participants do not belong to this trip.");
  }

  const lineItemsTotal = lineItems.reduce((sum, item) => sum + item.amount, 0);

  if (lineItemsTotal > amount) {
    throw createError(400, "Line items cannot exceed the total expense.");
  }

  const normalizedExpense = normalizeExpense({
    id: createId("expense"),
    title,
    category,
    amount,
    paidBy,
    participantIds,
    splitType,
    customShares:
      splitType === "custom"
        ? Object.fromEntries(participantIds.map((participantId) => [participantId, toNumber(input?.customShares?.[participantId])]))
        : undefined,
    notes,
    lineItems,
    createdAt: new Date().toISOString()
  });

  if (splitType === "custom") {
    const customTotal = participantIds.reduce((sum, participantId) => sum + toNumber(normalizedExpense.customShares?.[participantId]), 0);

    if (customTotal !== amount) {
      throw createError(400, "Custom shares must add up to the total expense.");
    }
  }

  return normalizedExpense;
}

async function getTripByIdFromDatabase(tripId) {
  await ensureDatabaseSchema();
  const sql = getSql();
  const trips = await sql`
    SELECT
      id,
      name,
      location,
      start_date AS "startDate",
      end_date AS "endDate",
      reminders_sent_at AS "remindersSentAt",
      created_at AS "createdAt"
    FROM trips
    WHERE id = ${tripId}
    LIMIT 1
  `;

  const tripRow = trips[0];

  if (!tripRow) {
    return null;
  }

  const participants = await sql`
      SELECT id, name, email
      FROM participants
      WHERE trip_id = ${tripId}
      ORDER BY created_at ASC, id ASC
    `;

  const expenseRows = await sql`
    SELECT
      id,
      title,
      category,
      amount,
      paid_by AS "paidBy",
      split_type AS "splitType",
      notes,
      created_at AS "createdAt"
    FROM expenses
    WHERE trip_id = ${tripId}
    ORDER BY created_at DESC, id DESC
  `;

  const expenses = [];

  for (const expenseRow of expenseRows) {
    const expenseParticipants = await sql`
      SELECT
        participant_id AS "participantId",
        share_amount AS "shareAmount",
        position
      FROM expense_participants
      WHERE expense_id = ${expenseRow.id}
      ORDER BY position ASC, participant_id ASC
    `;

    const lineItems = await sql`
      SELECT
        id,
        name,
        amount
      FROM expense_line_items
      WHERE expense_id = ${expenseRow.id}
      ORDER BY position ASC, id ASC
    `;

    expenses.push(
      normalizeExpense({
        ...expenseRow,
        participantIds: expenseParticipants.map((participant) => participant.participantId),
        customShares:
          expenseRow.splitType === "custom"
            ? Object.fromEntries(expenseParticipants.map((participant) => [participant.participantId, toNumber(participant.shareAmount)]))
            : undefined,
        lineItems
      })
    );
  }

  const paymentRows = await sql`
    SELECT
      id,
      from_participant_id AS "fromParticipantId",
      to_participant_id AS "toParticipantId",
      amount,
      provider,
      status,
      reference,
      created_at AS "createdAt",
      confirmed_at AS "confirmedAt",
      authorization_session_id AS "authorizationSessionId",
      state_nonce AS "stateNonce",
      idempotency_key AS "idempotencyKey",
      redirect_url AS "redirectUrl",
      authorization_status AS "authorizationStatus",
      authorization_expires_at AS "authorizationExpiresAt",
      authorized_actor_id AS "authorizedActorId",
      provider_transaction_id AS "providerTransactionId",
      verified_at AS "verifiedAt",
      step_up_required AS "stepUpRequired",
      step_up_challenge_id AS "stepUpChallengeId",
      step_up_masked_email AS "stepUpMaskedEmail",
      step_up_expires_at AS "stepUpExpiresAt",
      step_up_attempts_remaining AS "stepUpAttemptsRemaining",
      step_up_status AS "stepUpStatus",
      step_up_verified_at AS "stepUpVerifiedAt",
      debug_step_up_code AS "debugStepUpCode"
    FROM payments
    WHERE trip_id = ${tripId}
    ORDER BY created_at DESC, id DESC
  `;

  return normalizeTrip({
    ...tripRow,
    participants,
    expenses,
    payments: paymentRows
  });
}

async function listTripsFromDatabase() {
  await ensureDatabaseSchema();
  const sql = getSql();
  const tripRows = await sql`
    SELECT id
    FROM trips
    ORDER BY created_at DESC, id DESC
  `;

  const trips = [];

  for (const tripRow of tripRows) {
    const trip = await getTripByIdFromDatabase(tripRow.id);

    if (trip) {
      trips.push(trip);
    }
  }

  return trips;
}

async function createTripInDatabase(input) {
  await ensureDatabaseSchema();
  const sql = getSql();
  const validated = validateTripInput(input);
  const tripId = createId("trip");
  const participants = validated.participants.map((participant) => ({
      id: createId("person"),
      name: participant.name,
      email: participant.email || null
    }));
  const createdAt = new Date().toISOString();

  await sql`
    INSERT INTO trips (id, name, location, start_date, end_date, created_at)
    VALUES (${tripId}, ${validated.name}, ${validated.location}, ${validated.startDate}, ${validated.endDate}, ${createdAt})
  `;

    for (const participant of participants) {
      await sql`
        INSERT INTO participants (id, trip_id, name, email, created_at)
        VALUES (${participant.id}, ${tripId}, ${participant.name}, ${participant.email}, ${createdAt})
      `;
    }

  return getTripByIdFromDatabase(tripId);
}

async function addExpenseInDatabase(tripId, input) {
  await ensureDatabaseSchema();
  const sql = getSql();
  const trip = await getTripByIdFromDatabase(tripId);

  if (!trip) {
    throw createError(404, "Trip not found.");
  }

  const expense = validateExpenseInput(trip, input);
  const shareMap = getExpenseShares(expense);

  await sql`
    INSERT INTO expenses (id, trip_id, title, category, amount, paid_by, split_type, notes, created_at)
    VALUES (
      ${expense.id},
      ${tripId},
      ${expense.title},
      ${expense.category},
      ${expense.amount},
      ${expense.paidBy},
      ${expense.splitType},
      ${expense.notes || null},
      ${expense.createdAt}
    )
  `;

  for (const [position, participantId] of expense.participantIds.entries()) {
    await sql`
      INSERT INTO expense_participants (expense_id, participant_id, share_amount, position)
      VALUES (${expense.id}, ${participantId}, ${toNumber(shareMap[participantId])}, ${position})
    `;
  }

  for (const [position, lineItem] of expense.lineItems.entries()) {
    await sql`
      INSERT INTO expense_line_items (id, expense_id, name, amount, position)
      VALUES (${lineItem.id}, ${expense.id}, ${lineItem.name}, ${lineItem.amount}, ${position})
    `;
  }

  return getTripByIdFromDatabase(tripId);
}

async function markTripRemindersSentInDatabase(tripId) {
  await ensureDatabaseSchema();
  const sql = getSql();
  const reminderTimestamp = new Date().toISOString();

  await sql`
    UPDATE trips
    SET reminders_sent_at = ${reminderTimestamp}
    WHERE id = ${tripId}
  `;

  return getTripByIdFromDatabase(tripId);
}

async function deleteTripInDatabase(tripId) {
  await ensureDatabaseSchema();
  const existingTrip = await getTripByIdFromDatabase(tripId);

  if (!existingTrip) {
    throw createError(404, "Trip not found.");
  }

  const sql = getSql();
  await sql`
    DELETE FROM trips
    WHERE id = ${tripId}
  `;

  return existingTrip;
}

async function savePaymentInDatabase(tripId, paymentInput) {
  await ensureDatabaseSchema();
  const sql = getSql();
  const payment = normalizePayment(paymentInput);

  await sql`
    INSERT INTO payments (
      id,
      trip_id,
      from_participant_id,
      to_participant_id,
      amount,
      provider,
      status,
      reference,
      created_at,
      confirmed_at,
      authorization_session_id,
      state_nonce,
      idempotency_key,
      redirect_url,
      authorization_status,
      authorization_expires_at,
      authorized_actor_id,
      provider_transaction_id,
      verified_at,
      step_up_required,
      step_up_challenge_id,
      step_up_masked_email,
      step_up_expires_at,
      step_up_attempts_remaining,
      step_up_status,
      step_up_verified_at,
      debug_step_up_code
    )
    VALUES (
      ${payment.id},
      ${tripId},
      ${payment.fromParticipantId},
      ${payment.toParticipantId},
      ${payment.amount},
      ${payment.provider},
      ${payment.status},
      ${payment.reference},
      ${payment.createdAt},
      ${payment.confirmedAt},
      ${payment.authorizationSessionId},
      ${payment.stateNonce},
      ${payment.idempotencyKey},
      ${payment.redirectUrl},
      ${payment.authorizationStatus},
      ${payment.authorizationExpiresAt},
      ${payment.authorizedActorId},
      ${payment.providerTransactionId},
      ${payment.verifiedAt},
      ${payment.stepUpRequired},
      ${payment.stepUpChallengeId},
      ${payment.stepUpMaskedEmail},
      ${payment.stepUpExpiresAt},
      ${payment.stepUpAttemptsRemaining},
      ${payment.stepUpStatus},
      ${payment.stepUpVerifiedAt},
      ${payment.debugStepUpCode}
    )
    ON CONFLICT (id) DO UPDATE SET
      trip_id = EXCLUDED.trip_id,
      from_participant_id = EXCLUDED.from_participant_id,
      to_participant_id = EXCLUDED.to_participant_id,
      amount = EXCLUDED.amount,
      provider = EXCLUDED.provider,
      status = EXCLUDED.status,
      reference = EXCLUDED.reference,
      created_at = EXCLUDED.created_at,
      confirmed_at = EXCLUDED.confirmed_at,
      authorization_session_id = EXCLUDED.authorization_session_id,
      state_nonce = EXCLUDED.state_nonce,
      idempotency_key = EXCLUDED.idempotency_key,
      redirect_url = EXCLUDED.redirect_url,
      authorization_status = EXCLUDED.authorization_status,
      authorization_expires_at = EXCLUDED.authorization_expires_at,
      authorized_actor_id = EXCLUDED.authorized_actor_id,
      provider_transaction_id = EXCLUDED.provider_transaction_id,
      verified_at = EXCLUDED.verified_at,
      step_up_required = EXCLUDED.step_up_required,
      step_up_challenge_id = EXCLUDED.step_up_challenge_id,
      step_up_masked_email = EXCLUDED.step_up_masked_email,
      step_up_expires_at = EXCLUDED.step_up_expires_at,
      step_up_attempts_remaining = EXCLUDED.step_up_attempts_remaining,
      step_up_status = EXCLUDED.step_up_status,
      step_up_verified_at = EXCLUDED.step_up_verified_at,
      debug_step_up_code = EXCLUDED.debug_step_up_code
  `;

  return normalizePayment(payment);
}

export async function listTrips() {
  if (isDatabaseConfigured()) {
    return listTripsFromDatabase();
  }

  const state = await readLocalState();
  return state.trips.map(normalizeTrip).sort(sortByCreatedDesc);
}

export async function getTripById(tripId) {
  if (!tripId) {
    return null;
  }

  if (isDatabaseConfigured()) {
    return getTripByIdFromDatabase(tripId);
  }

  const state = await readLocalState();
  const trip = state.trips.find((item) => item.id === tripId);
  return trip ? normalizeTrip(trip) : null;
}

export async function createTrip(input) {
  if (isDatabaseConfigured()) {
    return createTripInDatabase(input);
  }

  const validated = validateTripInput(input);
  const trip = normalizeTrip({
    id: createId("trip"),
    name: validated.name,
    location: validated.location,
      startDate: validated.startDate,
      endDate: validated.endDate,
      remindersSentAt: null,
      participants: validated.participants.map((participant) => ({
        id: createId("person"),
        name: participant.name,
        email: participant.email || null
      })),
      expenses: [],
      payments: []
  });

  await updateLocalState((state) => ({
    ...state,
    trips: [trip, ...state.trips]
  }));

  return trip;
}

export async function addExpenseToTrip(tripId, input) {
  if (isDatabaseConfigured()) {
    return addExpenseInDatabase(tripId, input);
  }

  let updatedTrip = null;

  await updateLocalState((state) => {
    const trips = state.trips.map((trip) => {
      if (trip.id !== tripId) {
        return trip;
      }

      const normalizedTrip = normalizeTrip(trip);
      const expense = validateExpenseInput(normalizedTrip, input);
      updatedTrip = normalizeTrip({
        ...normalizedTrip,
        expenses: [expense, ...normalizedTrip.expenses]
      });
      return updatedTrip;
    });

    if (!updatedTrip) {
      throw createError(404, "Trip not found.");
    }

    return {
      ...state,
      trips
    };
  });

  return updatedTrip;
}

export async function markTripRemindersSent(tripId) {
  if (isDatabaseConfigured()) {
    return markTripRemindersSentInDatabase(tripId);
  }

  let updatedTrip = null;
  const reminderTimestamp = new Date().toISOString();

  await updateLocalState((state) => {
    const trips = state.trips.map((trip) => {
      if (trip.id !== tripId) {
        return trip;
      }

      updatedTrip = normalizeTrip({
        ...trip,
        remindersSentAt: reminderTimestamp
      });
      return updatedTrip;
    });

    if (!updatedTrip) {
      throw createError(404, "Trip not found.");
    }

    return {
      ...state,
      trips
    };
  });

  return updatedTrip;
}

export async function deleteTrip(tripId) {
  if (isDatabaseConfigured()) {
    return deleteTripInDatabase(tripId);
  }

  let deletedTrip = null;

  await updateLocalState((state) => {
    const existingTrip = state.trips.find((trip) => trip.id === tripId);

    if (!existingTrip) {
      throw createError(404, "Trip not found.");
    }

      deletedTrip = normalizeTrip(existingTrip);

      return {
        ...state,
        trips: state.trips.filter((trip) => trip.id !== tripId),
        settlementRequests: Array.isArray(state.settlementRequests)
          ? state.settlementRequests.filter((request) => request.tripId !== tripId)
          : []
      };
    });

  return deletedTrip;
}

export async function getPaymentById(tripId, paymentId) {
  if (!paymentId) {
    return null;
  }

  const trip = await getTripById(tripId);
  return trip?.payments?.find((payment) => payment.id === paymentId) || null;
}

export async function savePaymentRecord(tripId, paymentInput) {
  if (isDatabaseConfigured()) {
    return savePaymentInDatabase(tripId, paymentInput);
  }

  const payment = normalizePayment(paymentInput);
  let updatedTrip = null;

  await updateLocalState((state) => {
    const trips = state.trips.map((trip) => {
      if (trip.id !== tripId) {
        return trip;
      }

      const existingPayments = Array.isArray(trip.payments) ? trip.payments : [];
      const nextPayments = existingPayments.some((item) => item.id === payment.id)
        ? existingPayments.map((item) => (item.id === payment.id ? payment : item))
        : [payment, ...existingPayments];

      updatedTrip = normalizeTrip({
        ...trip,
        payments: nextPayments
      });

      return updatedTrip;
    });

    if (!updatedTrip) {
      throw createError(404, "Trip not found.");
    }

    return {
      ...state,
      trips
    };
  });

  return payment;
}
