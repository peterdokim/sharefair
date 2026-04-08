import "server-only";

import { randomUUID } from "node:crypto";
import { getExpenseShares } from "@/lib/trip-helpers";
import { isEmailDeliveryConfigured, sendSettlementNoticeEmail } from "@/lib/server/email";
import { readLocalState, updateLocalState } from "@/lib/server/local-data-store";
import { ensureDatabaseSchema, getSql, isDatabaseConfigured } from "@/lib/server/storage-runtime";
import { getTripById } from "@/lib/server/trip-repository";

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

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeRequest(request) {
  return {
    id: request.id,
    tripId: request.tripId,
    expenseId: request.expenseId,
    expenseTitle: String(request.expenseTitle || "").trim(),
    expenseCategory: String(request.expenseCategory || "").trim(),
    fromParticipantId: request.fromParticipantId,
    toParticipantId: request.toParticipantId,
    amount: toNumber(request.amount),
    dueAt: normalizeDate(request.dueAt),
    status: request.status || "pending",
    createdAt: normalizeDate(request.createdAt) || new Date().toISOString(),
    paidAt: normalizeDate(request.paidAt),
    confirmedAt: normalizeDate(request.confirmedAt),
    settledAt: normalizeDate(request.settledAt),
    initialSentAt: normalizeDate(request.initialSentAt),
    reminder3hSentAt: normalizeDate(request.reminder3hSentAt),
    reminder15mSentAt: normalizeDate(request.reminder15mSentAt)
  };
}

function sortByDue(left, right) {
  return new Date(left.dueAt || left.createdAt || 0) - new Date(right.dueAt || right.createdAt || 0);
}

function getEffectiveStatus(request, now = new Date()) {
  if (["paid", "confirmed", "settled"].includes(request.status)) {
    return request.status;
  }

  if (request.dueAt && new Date(request.dueAt).getTime() <= now.getTime()) {
    return "overdue";
  }

  return request.status || "pending";
}

function validateDueAt(value) {
  const dueAt = normalizeDate(value);

  if (!dueAt) {
    throw createError(400, "Choose an exact due date and time.");
  }

  if (new Date(dueAt).getTime() <= Date.now()) {
    throw createError(400, "The due time must be in the future.");
  }

  return dueAt;
}

async function listLocalSettlementRequests() {
  const state = await readLocalState();
  return (state.settlementRequests || []).map(normalizeRequest).sort(sortByDue);
}

async function saveLocalSettlementRequest(requestInput) {
  const request = normalizeRequest(requestInput);

  await updateLocalState((state) => {
    const existing = Array.isArray(state.settlementRequests) ? state.settlementRequests : [];
    const next = existing.some((entry) => entry.id === request.id)
      ? existing.map((entry) => (entry.id === request.id ? request : entry))
      : [...existing, request];

    return {
      ...state,
      settlementRequests: next
    };
  });

  return request;
}

async function listDatabaseSettlementRequests() {
  await ensureDatabaseSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT
      id,
      trip_id AS "tripId",
      expense_id AS "expenseId",
      expense_title AS "expenseTitle",
      expense_category AS "expenseCategory",
      from_participant_id AS "fromParticipantId",
      to_participant_id AS "toParticipantId",
      amount,
      due_at AS "dueAt",
      status,
      created_at AS "createdAt",
      paid_at AS "paidAt",
      confirmed_at AS "confirmedAt",
      settled_at AS "settledAt",
      initial_sent_at AS "initialSentAt",
      reminder_3h_sent_at AS "reminder3hSentAt",
      reminder_15m_sent_at AS "reminder15mSentAt"
    FROM settlement_requests
    ORDER BY due_at ASC, created_at ASC
  `;

  return rows.map(normalizeRequest);
}

async function saveDatabaseSettlementRequest(requestInput) {
  await ensureDatabaseSchema();
  const sql = getSql();
  const request = normalizeRequest(requestInput);

  await sql`
    INSERT INTO settlement_requests (
      id, trip_id, expense_id, expense_title, expense_category, from_participant_id, to_participant_id, amount, due_at,
      status, created_at, paid_at, confirmed_at, settled_at, initial_sent_at, reminder_3h_sent_at, reminder_15m_sent_at
    )
    VALUES (
      ${request.id}, ${request.tripId}, ${request.expenseId}, ${request.expenseTitle}, ${request.expenseCategory},
      ${request.fromParticipantId}, ${request.toParticipantId}, ${request.amount}, ${request.dueAt}, ${request.status},
      ${request.createdAt}, ${request.paidAt}, ${request.confirmedAt}, ${request.settledAt}, ${request.initialSentAt},
      ${request.reminder3hSentAt}, ${request.reminder15mSentAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      trip_id = EXCLUDED.trip_id,
      expense_id = EXCLUDED.expense_id,
      expense_title = EXCLUDED.expense_title,
      expense_category = EXCLUDED.expense_category,
      from_participant_id = EXCLUDED.from_participant_id,
      to_participant_id = EXCLUDED.to_participant_id,
      amount = EXCLUDED.amount,
      due_at = EXCLUDED.due_at,
      status = EXCLUDED.status,
      created_at = EXCLUDED.created_at,
      paid_at = EXCLUDED.paid_at,
      confirmed_at = EXCLUDED.confirmed_at,
      settled_at = EXCLUDED.settled_at,
      initial_sent_at = EXCLUDED.initial_sent_at,
      reminder_3h_sent_at = EXCLUDED.reminder_3h_sent_at,
      reminder_15m_sent_at = EXCLUDED.reminder_15m_sent_at
  `;

  return request;
}

async function saveSettlementRequest(request) {
  return isDatabaseConfigured() ? saveDatabaseSettlementRequest(request) : saveLocalSettlementRequest(request);
}

async function listSettlementRequests() {
  return isDatabaseConfigured() ? listDatabaseSettlementRequests() : listLocalSettlementRequests();
}

export async function listSettlementRequestsForTrip(tripId) {
  const requests = await listSettlementRequests();
  return requests.filter((request) => request.tripId === tripId).sort(sortByDue);
}

export async function listSettlementRequestsForExpense(tripId, expenseId) {
  const requests = await listSettlementRequestsForTrip(tripId);
  return requests.filter((request) => request.expenseId === expenseId);
}

export async function createExpenseSettlementRequests(tripId, expenseId, input) {
  if (!isEmailDeliveryConfigured()) {
    throw createError(500, "Real reminder emails are not configured yet. Add RESEND_API_KEY and SHAREFAIR_EMAIL_FROM.");
  }

  const dueAt = validateDueAt(input?.dueAt);
  const trip = await getTripById(tripId);

  if (!trip) {
    throw createError(404, "Trip not found.");
  }

  const expense = trip.expenses.find((entry) => entry.id === expenseId);

  if (!expense) {
    throw createError(404, "Expense not found.");
  }

  if (!["food", "transport"].includes(expense.category.toLowerCase())) {
    throw createError(400, "Settle now is only available for food and transportation expenses.");
  }

  const shares = getExpenseShares(expense);
  const payer = trip.participants.find((participant) => participant.id === expense.paidBy);
  const existingRequests = await listSettlementRequestsForExpense(tripId, expenseId);
  const createdAt = new Date().toISOString();
  const savedRequests = [];

  for (const participantId of expense.participantIds) {
    if (participantId === expense.paidBy) {
      continue;
    }

    const debtor = trip.participants.find((participant) => participant.id === participantId);
    const amount = toNumber(shares[participantId]);

    if (!debtor || !amount) {
      continue;
    }

    if (!debtor.email) {
      throw createError(400, `Add an email for ${debtor.name} before enforcing a due-time reminder.`);
    }

    const existingRequest = existingRequests.find(
      (request) => request.fromParticipantId === participantId && request.status !== "settled"
    );

    const request = normalizeRequest({
      id: existingRequest?.id || createId("settle"),
      tripId,
      expenseId,
      expenseTitle: expense.title,
      expenseCategory: expense.category,
      fromParticipantId: participantId,
      toParticipantId: expense.paidBy,
      amount,
      dueAt,
      status: "pending",
      createdAt: existingRequest?.createdAt || createdAt,
      paidAt: null,
      confirmedAt: null,
      settledAt: null,
      initialSentAt: createdAt,
      reminder3hSentAt: null,
      reminder15mSentAt: null
    });

    await sendSettlementNoticeEmail({
      to: debtor.email,
      type: "initial",
      tripName: trip.name,
      expenseTitle: expense.title,
      expenseCategory: expense.category,
      amount: request.amount,
      dueAt,
      debtorName: debtor.name,
      payerName: payer?.name || "your friend"
    });

    savedRequests.push(await saveSettlementRequest(request));
  }

  if (!savedRequests.length) {
    throw createError(400, "There is no outstanding share to enforce for this expense.");
  }

  return listSettlementRequestsForExpense(tripId, expenseId);
}

export async function updateSettlementRequestStatus(tripId, requestId, action) {
  const requests = await listSettlementRequestsForTrip(tripId);
  const request = requests.find((entry) => entry.id === requestId);

  if (!request) {
    throw createError(404, "Settlement request not found.");
  }

  const now = new Date().toISOString();

  if (action === "mark_paid") {
    if (request.status === "settled") {
      throw createError(400, "This debt is already settled.");
    }

    if (request.status === "confirmed") {
      throw createError(400, "This debt is already confirmed by the creditor.");
    }

    return saveSettlementRequest({
      ...request,
      status: "paid",
      paidAt: now
    });
  }

  if (action === "confirm_payment") {
    if (request.status === "settled") {
      throw createError(400, "This debt is already settled.");
    }

    if (request.status !== "paid") {
      throw createError(400, "The debtor needs to mark this debt as paid before the creditor can confirm it.");
    }

    return saveSettlementRequest({
      ...request,
      status: "confirmed",
      paidAt: request.paidAt || now,
      confirmedAt: now
    });
  }

  throw createError(400, "Unsupported settlement action.");
}

export async function settleExpenseBill(tripId, expenseId) {
  const requests = await listSettlementRequestsForExpense(tripId, expenseId);

  if (!requests.length) {
    throw createError(404, "No settlement requests exist for this expense.");
  }

  const hasOpenDebt = requests.some((request) => !["confirmed", "settled"].includes(request.status));

  if (hasOpenDebt) {
    throw createError(400, "Every debt on this bill must be confirmed before the creditor can settle the bill.");
  }

  const settledAt = new Date().toISOString();

  for (const request of requests) {
    await saveSettlementRequest({
      ...request,
      status: "settled",
      paidAt: request.paidAt || request.confirmedAt || settledAt,
      confirmedAt: request.confirmedAt || settledAt,
      settledAt
    });
  }

  return listSettlementRequestsForExpense(tripId, expenseId);
}

export async function processSettlementReminderQueue(nowInput = new Date()) {
  if (!isEmailDeliveryConfigured()) {
    throw createError(500, "Real reminder emails are not configured yet.");
  }

  const now = new Date(nowInput);
  const requests = await listSettlementRequests();
  let processed = 0;
  let threeHourReminders = 0;
  let fifteenMinuteReminders = 0;
  let overdueMarked = 0;

  for (const request of requests) {
    const trip = await getTripById(request.tripId);
    if (!trip) continue;
    const debtor = trip.participants.find((participant) => participant.id === request.fromParticipantId);
    const payer = trip.participants.find((participant) => participant.id === request.toParticipantId);
    if (!debtor?.email) continue;

    let nextRequest = request;
    const currentStatus = getEffectiveStatus(request, now);
    const millisUntilDue = new Date(request.dueAt).getTime() - now.getTime();

    if (currentStatus === "overdue" && ["pending", "overdue"].includes(request.status)) {
      nextRequest = normalizeRequest({ ...nextRequest, status: "overdue" });
      overdueMarked += 1;
    }

    let reminderType = null;
    if (["pending", "overdue"].includes(nextRequest.status)) {
      if (millisUntilDue > 0 && millisUntilDue <= 15 * 60 * 1000 && !nextRequest.reminder15mSentAt) {
        reminderType = "15m";
      } else if (millisUntilDue > 15 * 60 * 1000 && millisUntilDue <= 3 * 60 * 60 * 1000 && !nextRequest.reminder3hSentAt) {
        reminderType = "3h";
      }
    }

    if (reminderType) {
      await sendSettlementNoticeEmail({
        to: debtor.email,
        type: reminderType,
        tripName: trip.name,
        expenseTitle: nextRequest.expenseTitle,
        expenseCategory: nextRequest.expenseCategory,
        amount: nextRequest.amount,
        dueAt: nextRequest.dueAt,
        debtorName: debtor.name,
        payerName: payer?.name || "your friend"
      });

      nextRequest = normalizeRequest({
        ...nextRequest,
        reminder3hSentAt: reminderType === "3h" ? now.toISOString() : nextRequest.reminder3hSentAt,
        reminder15mSentAt: reminderType === "15m" ? now.toISOString() : nextRequest.reminder15mSentAt
      });
      if (reminderType === "3h") threeHourReminders += 1;
      if (reminderType === "15m") fifteenMinuteReminders += 1;
    }

    if (nextRequest !== request) {
      await saveSettlementRequest(nextRequest);
      processed += 1;
    }
  }

  return { ok: true, processed, threeHourReminders, fifteenMinuteReminders, overdueMarked };
}
