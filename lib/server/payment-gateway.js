import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { isEmailDeliveryConfigured, sendStepUpVerificationEmail } from "@/lib/server/email";
import {
  getPaymentSession,
  getProviderTransaction,
  savePaymentSession,
  saveProviderTransaction
} from "@/lib/server/payment-session-store";
import { getPaymentById, getTripById, savePaymentRecord } from "@/lib/server/trip-repository";

const PROVIDERS = new Set(["bank-transfer", "local-wallet"]);
const SESSION_TTL_MS = 1000 * 60 * 15;
const STEP_UP_TTL_MS = 1000 * 60 * 5;
const STEP_UP_MAX_ATTEMPTS = 5;
const WEBHOOK_SECRET = process.env.SHAREFAIR_WEBHOOK_SECRET || "sharefair-dev-webhook-secret";
const STEP_UP_SECRET = process.env.SHAREFAIR_STEP_UP_SECRET || "sharefair-dev-step-up-secret";

function createError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function buildReference(provider) {
  const prefix = provider === "bank-transfer" ? "BANK" : "WALLET";
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function maskEmailAddress(email) {
  const [localPart, domain] = email.split("@");

  if (!localPart || !domain) {
    return "hidden-email";
  }

  const visible = localPart.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(localPart.length - 2, 2))}@${domain}`;
}

function buildRedirectPath(pathname, params) {
  const query = new URLSearchParams(params);
  return `${pathname}?${query.toString()}`;
}

function buildProviderRedirectUrl(sessionId, state) {
  return buildRedirectPath("/api/mock-provider/authorize", {
    sessionId,
    state
  });
}

function buildIdempotencyKey(paymentId, tripId, amount) {
  return `${tripId}:${paymentId}:${Math.round(Number(amount))}`;
}

function signStepUpCode(challengeId, code) {
  return createHmac("sha256", STEP_UP_SECRET).update(`${challengeId}:${code}`).digest("hex");
}

function generateStepUpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createStepUpChallenge(actor) {
  if (!isEmailDeliveryConfigured()) {
    throw createError(500, "Real email verification is not configured yet. Add RESEND_API_KEY and SHAREFAIR_EMAIL_FROM.");
  }

  const destinationEmail = normalizeEmail(actor?.participantEmail);

  if (!destinationEmail) {
    throw createError(400, "Add an email address for this participant before starting email verification.");
  }

  const code = generateStepUpCode();
  const challengeId = `mfa_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + STEP_UP_TTL_MS).toISOString();

  return {
    id: challengeId,
    destinationEmail,
    maskedDestination: maskEmailAddress(destinationEmail),
    codeHash: signStepUpCode(challengeId, code),
    expiresAt,
    attemptsRemaining: STEP_UP_MAX_ATTEMPTS,
    status: "required",
    verifiedAt: null,
    code
  };
}

function stripTransientStepUpFields(challenge) {
  const { code, ...storedChallenge } = challenge;
  return storedChallenge;
}

async function deliverStepUpChallenge(session, challenge) {
  await sendStepUpVerificationEmail({
    to: challenge.destinationEmail,
    code: challenge.code,
    expiresAt: challenge.expiresAt,
    tripName: session.tripName,
    actorName: session.actorName,
    recipientName: session.toParticipantName,
    amount: session.amount
  });
}

function assertActorOwnsSession(actor, session) {
  if (!actor?.participantId) {
    throw createError(401, "No signed-in actor session was found.");
  }

  if (actor.participantId !== session.actorId) {
    throw createError(403, "The signed-in actor does not match the sender for this payment.");
  }
}

async function persistPaymentPatch(session, patch) {
  const existingPayment = await getPaymentById(session.tripId, session.clientPaymentId);

  if (!existingPayment) {
    throw createError(404, "Payment record not found.");
  }

  return savePaymentRecord(session.tripId, {
    ...existingPayment,
    ...patch,
    id: existingPayment.id,
    fromParticipantId: session.fromParticipantId,
    toParticipantId: session.toParticipantId,
    amount: session.amount,
    provider: session.provider,
    reference: existingPayment.reference || session.reference,
    createdAt: existingPayment.createdAt || session.createdAt
  });
}

export async function createPaymentAuthorizationSession(input) {
  const { actor, tripId, fromParticipantId, toParticipantId, amount, provider } = input;
  const paymentId = input.clientPaymentId || `payment_${randomUUID()}`;
  const actorEmail = normalizeEmail(actor?.participantEmail);

  if (!actor?.participantId) {
    throw createError(401, "No signed-in actor session was found.");
  }

  if (actor.participantId !== fromParticipantId) {
    throw createError(403, "The signed-in user is not allowed to initiate this transfer.");
  }

  if (!tripId || !fromParticipantId || !toParticipantId) {
    throw createError(400, "Missing payment session fields.");
  }

  if (fromParticipantId === toParticipantId) {
    throw createError(400, "The sender and receiver cannot be the same person.");
  }

  if (!PROVIDERS.has(provider)) {
    throw createError(400, "Unsupported provider.");
  }

  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    throw createError(400, "Amount must be greater than zero.");
  }

  if (!isEmailDeliveryConfigured()) {
    throw createError(500, "Real email verification is not configured yet. Add RESEND_API_KEY and SHAREFAIR_EMAIL_FROM.");
  }

  if (!actorEmail) {
    throw createError(400, "Add an email address for this participant before starting real email verification.");
  }

  const trip = await getTripById(tripId);

  if (!trip) {
    throw createError(404, "Trip not found.");
  }

  const participantsById = new Map(trip.participants.map((participant) => [participant.id, participant]));

  if (!participantsById.has(fromParticipantId) || !participantsById.has(toParticipantId)) {
    throw createError(400, "The payment participants must belong to this trip.");
  }

  const stepUpChallenge = createStepUpChallenge(actor);
  const storedChallenge = stripTransientStepUpFields(stepUpChallenge);
  const sessionId = `ps_${randomUUID()}`;
  const stateNonce = randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  const session = {
    id: sessionId,
    tripId,
    tripName: trip.name,
    clientPaymentId: paymentId,
    fromParticipantId,
    fromParticipantName: participantsById.get(fromParticipantId)?.name || "Traveler",
    toParticipantId,
    toParticipantName: participantsById.get(toParticipantId)?.name || "Traveler",
    amount: Math.round(Number(amount)),
    provider,
    actorId: actor.participantId,
    actorName: actor.participantName || "Unknown",
    actorEmail,
    reference: buildReference(provider),
    stateNonce,
    idempotencyKey: buildIdempotencyKey(paymentId, tripId, amount),
    authorizationStatus: "step_up_required",
    createdAt: now.toISOString(),
    expiresAt,
    stepUp: storedChallenge,
    providerTransactionId: null,
    verifiedAt: null
  };

  await deliverStepUpChallenge(session, stepUpChallenge);
  await savePaymentSession(session);

  const payment = await savePaymentRecord(tripId, {
    id: paymentId,
    fromParticipantId,
    toParticipantId,
    amount: session.amount,
    provider,
    status: "pending",
    reference: session.reference,
    createdAt: session.createdAt,
    confirmedAt: null,
    authorizationSessionId: session.id,
    stateNonce,
    idempotencyKey: session.idempotencyKey,
    redirectUrl: null,
    authorizationStatus: session.authorizationStatus,
    authorizationExpiresAt: expiresAt,
    authorizedActorId: session.actorId,
    providerTransactionId: null,
    verifiedAt: null,
    stepUpRequired: true,
    stepUpChallengeId: storedChallenge.id,
    stepUpMaskedEmail: storedChallenge.maskedDestination,
    stepUpExpiresAt: storedChallenge.expiresAt,
    stepUpAttemptsRemaining: storedChallenge.attemptsRemaining,
    stepUpStatus: storedChallenge.status,
    stepUpVerifiedAt: storedChallenge.verifiedAt,
    debugStepUpCode: null
  });

  return {
    sessionId,
    paymentId,
    redirectUrl: null,
    expiresAt,
    idempotencyKey: session.idempotencyKey,
    stateNonce,
    authorizationStatus: session.authorizationStatus,
    reference: session.reference,
    authorizedActorId: session.actorId,
    stepUpRequired: true,
    stepUpChallengeId: storedChallenge.id,
    stepUpMaskedEmail: storedChallenge.maskedDestination,
    stepUpExpiresAt: storedChallenge.expiresAt,
    stepUpAttemptsRemaining: storedChallenge.attemptsRemaining,
    debugStepUpCode: null,
    payment
  };
}

export async function authorizeMockProviderSession(sessionId, state) {
  const session = await getPaymentSession(sessionId);

  if (!session) {
    throw createError(404, "Payment session not found.");
  }

  if (session.stateNonce !== state) {
    throw createError(400, "State token mismatch.");
  }

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    throw createError(410, "Payment session expired.");
  }

  if (session.stepUp?.status !== "verified") {
    throw createError(403, "Step-up verification is required before redirecting to the provider.");
  }

  const providerTransactionId = `txn_${randomUUID()}`;

  await saveProviderTransaction({
    id: providerTransactionId,
    sessionId: session.id,
    provider: session.provider,
    status: "authorized",
    amount: session.amount,
    fromParticipantId: session.fromParticipantId,
    toParticipantId: session.toParticipantId,
    verifiedAt: new Date().toISOString()
  });

  return buildRedirectPath("/api/payments/callback", {
    sessionId: session.id,
    state,
    providerTransactionId,
    providerStatus: "authorized"
  });
}

export async function verifyStepUpChallenge(input) {
  const { actor, sessionId, clientPaymentId, challengeId, code } = input;
  const session = await getPaymentSession(sessionId);

  if (!session || session.clientPaymentId !== clientPaymentId) {
    throw createError(404, "Payment session not found.");
  }

  assertActorOwnsSession(actor, session);

  if (!session.stepUp || session.stepUp.id !== challengeId) {
    throw createError(400, "Verification challenge not found.");
  }

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    throw createError(410, "Payment session expired.");
  }

  if (new Date(session.stepUp.expiresAt).getTime() < Date.now()) {
    throw createError(410, "The email code expired. Request a new code.");
  }

  if (session.stepUp.status === "verified") {
    return {
      sessionId: session.id,
      clientPaymentId: session.clientPaymentId,
      authorizationStatus: session.authorizationStatus,
      redirectUrl: buildProviderRedirectUrl(session.id, session.stateNonce),
      stepUpStatus: session.stepUp.status,
      stepUpVerifiedAt: session.stepUp.verifiedAt,
      stepUpAttemptsRemaining: session.stepUp.attemptsRemaining,
      providerReference: session.reference
    };
  }

  if (!code || !/^\d{6}$/.test(code)) {
    throw createError(400, "Enter the 6-digit code from the email.");
  }

  const providedHash = signStepUpCode(challengeId, code);
  const expectedHash = session.stepUp.codeHash;
  const providedBuffer = Buffer.from(providedHash, "utf8");
  const expectedBuffer = Buffer.from(expectedHash, "utf8");
  const isMatch =
    providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);

  if (!isMatch) {
    const attemptsRemaining = Math.max(session.stepUp.attemptsRemaining - 1, 0);
    const updatedSession = {
      ...session,
      stepUp: {
        ...session.stepUp,
        attemptsRemaining
      }
    };

    await savePaymentSession(updatedSession);
    await persistPaymentPatch(updatedSession, {
      stepUpAttemptsRemaining: attemptsRemaining
    });

    if (attemptsRemaining === 0) {
      throw createError(429, "Too many incorrect codes. Request a new email code.");
    }

    throw createError(400, `That code did not match. ${attemptsRemaining} attempts remaining.`);
  }

  const verifiedAt = new Date().toISOString();
  const redirectUrl = buildProviderRedirectUrl(session.id, session.stateNonce);
  const updatedSession = {
    ...session,
    authorizationStatus: "step_up_verified",
    stepUp: {
      ...session.stepUp,
      status: "verified",
      verifiedAt
    }
  };

  await savePaymentSession(updatedSession);
  await persistPaymentPatch(updatedSession, {
    status: "redirected",
    redirectUrl,
    authorizationStatus: updatedSession.authorizationStatus,
    stepUpStatus: updatedSession.stepUp.status,
    stepUpVerifiedAt: verifiedAt,
    stepUpAttemptsRemaining: updatedSession.stepUp.attemptsRemaining,
    debugStepUpCode: null
  });

  return {
    sessionId: updatedSession.id,
    clientPaymentId: updatedSession.clientPaymentId,
    authorizationStatus: updatedSession.authorizationStatus,
    redirectUrl,
    stepUpStatus: updatedSession.stepUp.status,
    stepUpVerifiedAt: updatedSession.stepUp.verifiedAt,
    stepUpAttemptsRemaining: updatedSession.stepUp.attemptsRemaining,
    providerReference: updatedSession.reference
  };
}

export async function resendStepUpChallenge(input) {
  const { actor, sessionId, clientPaymentId } = input;
  const session = await getPaymentSession(sessionId);

  if (!session || session.clientPaymentId !== clientPaymentId) {
    throw createError(404, "Payment session not found.");
  }

  assertActorOwnsSession(actor, session);

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    throw createError(410, "Payment session expired.");
  }

  const refreshedChallenge = createStepUpChallenge({
    participantId: session.actorId,
    participantName: session.actorName,
    participantEmail: session.actorEmail || null
  });
  const storedChallenge = stripTransientStepUpFields(refreshedChallenge);
  const updatedSession = {
    ...session,
    authorizationStatus: "step_up_required",
    stepUp: storedChallenge
  };

  await deliverStepUpChallenge(updatedSession, refreshedChallenge);
  await savePaymentSession(updatedSession);
  await persistPaymentPatch(updatedSession, {
    status: "pending",
    authorizationStatus: updatedSession.authorizationStatus,
    stepUpRequired: true,
    stepUpChallengeId: storedChallenge.id,
    stepUpMaskedEmail: storedChallenge.maskedDestination,
    stepUpExpiresAt: storedChallenge.expiresAt,
    stepUpAttemptsRemaining: storedChallenge.attemptsRemaining,
    stepUpStatus: storedChallenge.status,
    stepUpVerifiedAt: null,
    debugStepUpCode: null
  });

  return {
    sessionId: updatedSession.id,
    clientPaymentId: updatedSession.clientPaymentId,
    authorizationStatus: updatedSession.authorizationStatus,
    stepUpRequired: true,
    stepUpChallengeId: storedChallenge.id,
    stepUpMaskedEmail: storedChallenge.maskedDestination,
    stepUpExpiresAt: storedChallenge.expiresAt,
    stepUpAttemptsRemaining: storedChallenge.attemptsRemaining,
    debugStepUpCode: null
  };
}

export async function verifyPaymentCallback(input) {
  const { sessionId, state, providerTransactionId, providerStatus } = input;
  const session = await getPaymentSession(sessionId);

  if (!session) {
    throw createError(404, "Payment session not found.");
  }

  if (session.stateNonce !== state) {
    throw createError(400, "State token mismatch.");
  }

  if (new Date(session.expiresAt).getTime() < Date.now()) {
    throw createError(410, "Payment session expired.");
  }

  const transaction = await getProviderTransaction(providerTransactionId);

  if (!transaction) {
    throw createError(400, "Provider transaction could not be verified.");
  }

  if (!["authorized", "completed"].includes(providerStatus)) {
    throw createError(400, "Provider reported a non-authorized status.");
  }

  if (
    transaction.sessionId !== session.id ||
    transaction.amount !== session.amount ||
    transaction.fromParticipantId !== session.fromParticipantId ||
    transaction.toParticipantId !== session.toParticipantId
  ) {
    throw createError(400, "Provider transaction does not belong to this payment session.");
  }

  const verifiedAt = new Date().toISOString();
  const updatedSession = {
    ...session,
    providerTransactionId,
    authorizationStatus: providerStatus,
    verifiedAt
  };

  await savePaymentSession(updatedSession);
  await persistPaymentPatch(updatedSession, {
    status: "confirmed",
    confirmedAt: verifiedAt,
    authorizationStatus: providerStatus,
    providerTransactionId,
    verifiedAt
  });

  return updatedSession;
}

export function signWebhookPayload(payload) {
  return createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex");
}

export function verifyWebhookSignature(payload, signature) {
  if (!signature) {
    return false;
  }

  const expected = signWebhookPayload(payload);
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer);
}

export async function verifyWebhookEvent(event) {
  const session = await getPaymentSession(event.sessionId);

  if (!session) {
    throw createError(404, "Payment session not found.");
  }

  const transaction = await getProviderTransaction(event.providerTransactionId);

  if (!transaction) {
    throw createError(400, "Unknown provider transaction.");
  }

  if (!["authorized", "completed"].includes(event.status)) {
    throw createError(400, "Webhook status is not authorized.");
  }

  const verifiedAt = new Date().toISOString();
  const updatedSession = {
    ...session,
    providerTransactionId: event.providerTransactionId,
    authorizationStatus: event.status,
    verifiedAt
  };

  await savePaymentSession(updatedSession);
  await persistPaymentPatch(updatedSession, {
    status: "confirmed",
    confirmedAt: verifiedAt,
    authorizationStatus: event.status,
    providerTransactionId: event.providerTransactionId,
    verifiedAt
  });

  return updatedSession;
}

export async function buildCallbackErrorRedirect(sessionId, message) {
  const session = await getPaymentSession(sessionId);

  if (!session) {
    return "/?paymentError=session-not-found";
  }

  return buildRedirectPath(`/trip/${session.tripId}/payments/${session.clientPaymentId}`, {
    callbackError: message
  });
}
