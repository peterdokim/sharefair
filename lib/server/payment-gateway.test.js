import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  emailMockState,
  sessionStoreState,
  providerTransactionState,
  tripRepositoryState
} = vi.hoisted(() => ({
  emailMockState: {
    sendStepUpVerificationEmail: vi.fn(),
    isEmailDeliveryConfigured: vi.fn()
  },
  sessionStoreState: {
    sessions: new Map(),
    savePaymentSession: vi.fn(),
    getPaymentSession: vi.fn()
  },
  providerTransactionState: {
    transactions: new Map(),
    saveProviderTransaction: vi.fn(),
    getProviderTransaction: vi.fn()
  },
  tripRepositoryState: {
    trips: new Map(),
    payments: new Map(),
    getTripById: vi.fn(),
    getPaymentById: vi.fn(),
    savePaymentRecord: vi.fn()
  }
}));

vi.mock("@/lib/server/email", () => ({
  isEmailDeliveryConfigured: emailMockState.isEmailDeliveryConfigured,
  sendStepUpVerificationEmail: emailMockState.sendStepUpVerificationEmail
}));

vi.mock("@/lib/server/payment-session-store", () => ({
  savePaymentSession: sessionStoreState.savePaymentSession,
  getPaymentSession: sessionStoreState.getPaymentSession,
  saveProviderTransaction: providerTransactionState.saveProviderTransaction,
  getProviderTransaction: providerTransactionState.getProviderTransaction
}));

vi.mock("@/lib/server/trip-repository", () => ({
  getTripById: tripRepositoryState.getTripById,
  getPaymentById: tripRepositoryState.getPaymentById,
  savePaymentRecord: tripRepositoryState.savePaymentRecord
}));

import { createPaymentAuthorizationSession, verifyStepUpChallenge } from "@/lib/server/payment-gateway";

function paymentKey(tripId, paymentId) {
  return `${tripId}:${paymentId}`;
}

describe("payment gateway step-up verification", () => {
  beforeEach(() => {
    emailMockState.sendStepUpVerificationEmail.mockReset();
    emailMockState.isEmailDeliveryConfigured.mockReset();
    emailMockState.isEmailDeliveryConfigured.mockReturnValue(true);
    emailMockState.sendStepUpVerificationEmail.mockResolvedValue({ id: "email_123" });

    sessionStoreState.sessions.clear();
    sessionStoreState.savePaymentSession.mockReset();
    sessionStoreState.getPaymentSession.mockReset();
    sessionStoreState.savePaymentSession.mockImplementation(async (session) => {
      sessionStoreState.sessions.set(session.id, structuredClone(session));
      return session;
    });
    sessionStoreState.getPaymentSession.mockImplementation(async (sessionId) => {
      const session = sessionStoreState.sessions.get(sessionId);
      return session ? structuredClone(session) : null;
    });

    providerTransactionState.transactions.clear();
    providerTransactionState.saveProviderTransaction.mockReset();
    providerTransactionState.getProviderTransaction.mockReset();
    providerTransactionState.saveProviderTransaction.mockImplementation(async (transaction) => {
      providerTransactionState.transactions.set(transaction.id, structuredClone(transaction));
      return transaction;
    });
    providerTransactionState.getProviderTransaction.mockImplementation(async (transactionId) => {
      const transaction = providerTransactionState.transactions.get(transactionId);
      return transaction ? structuredClone(transaction) : null;
    });

    tripRepositoryState.trips.clear();
    tripRepositoryState.payments.clear();
    tripRepositoryState.getTripById.mockReset();
    tripRepositoryState.getPaymentById.mockReset();
    tripRepositoryState.savePaymentRecord.mockReset();
    tripRepositoryState.getTripById.mockImplementation(async (tripId) => {
      const trip = tripRepositoryState.trips.get(tripId);
      return trip ? structuredClone(trip) : null;
    });
    tripRepositoryState.getPaymentById.mockImplementation(async (tripId, paymentId) => {
      const payment = tripRepositoryState.payments.get(paymentKey(tripId, paymentId));
      return payment ? structuredClone(payment) : null;
    });
    tripRepositoryState.savePaymentRecord.mockImplementation(async (tripId, payment) => {
      const normalizedPayment = structuredClone(payment);
      tripRepositoryState.payments.set(paymentKey(tripId, payment.id), normalizedPayment);
      return normalizedPayment;
    });

    tripRepositoryState.trips.set("trip_1", {
      id: "trip_1",
      name: "Smart Contract test trip",
      participants: [
        { id: "person_mina", name: "Mina", email: "mina@example.com" },
        { id: "person_joon", name: "Joon", email: "joon@example.com" }
      ],
      expenses: [],
      payments: []
    });
  });

  it("creates a payment session and emails a 6-digit verification code", async () => {
    const result = await createPaymentAuthorizationSession({
      actor: {
        participantId: "person_mina",
        participantName: "Mina",
        participantEmail: "mina@example.com"
      },
      tripId: "trip_1",
      fromParticipantId: "person_mina",
      toParticipantId: "person_joon",
      amount: 18000,
      provider: "bank-transfer"
    });

    expect(result.sessionId).toMatch(/^ps_/);
    expect(result.authorizationStatus).toBe("step_up_required");
    expect(result.stepUpRequired).toBe(true);
    expect(result.stepUpChallengeId).toMatch(/^mfa_/);
    expect(result.stepUpMaskedEmail).toBe("mi**@example.com");
    expect(emailMockState.sendStepUpVerificationEmail).toHaveBeenCalledTimes(1);

    const emailPayload = emailMockState.sendStepUpVerificationEmail.mock.calls[0][0];

    expect(emailPayload.to).toBe("mina@example.com");
    expect(emailPayload.tripName).toBe("Smart Contract test trip");
    expect(emailPayload.recipientName).toBe("Joon");
    expect(emailPayload.amount).toBe(18000);
    expect(emailPayload.code).toMatch(/^\d{6}$/);

    const storedSession = sessionStoreState.sessions.get(result.sessionId);
    const storedPayment = tripRepositoryState.payments.get(paymentKey("trip_1", result.paymentId));

    expect(storedSession?.stepUp?.status).toBe("required");
    expect(storedSession?.stepUp?.attemptsRemaining).toBe(5);
    expect(storedPayment?.status).toBe("pending");
    expect(storedPayment?.stepUpStatus).toBe("required");
    expect(storedPayment?.stepUpAttemptsRemaining).toBe(5);
  });

  it("rejects an incorrect email code and decrements attempts remaining", async () => {
    const session = await createPaymentAuthorizationSession({
      actor: {
        participantId: "person_mina",
        participantName: "Mina",
        participantEmail: "mina@example.com"
      },
      tripId: "trip_1",
      fromParticipantId: "person_mina",
      toParticipantId: "person_joon",
      amount: 21000,
      provider: "local-wallet"
    });

    const sentCode = emailMockState.sendStepUpVerificationEmail.mock.calls[0][0].code;
    const wrongCode = sentCode === "000000" ? "111111" : "000000";

    await expect(
      verifyStepUpChallenge({
        actor: {
          participantId: "person_mina",
          participantName: "Mina",
          participantEmail: "mina@example.com"
        },
        sessionId: session.sessionId,
        clientPaymentId: session.paymentId,
        challengeId: session.stepUpChallengeId,
        code: wrongCode
      })
    ).rejects.toThrow("That code did not match. 4 attempts remaining.");

    const storedSession = sessionStoreState.sessions.get(session.sessionId);
    const storedPayment = tripRepositoryState.payments.get(paymentKey("trip_1", session.paymentId));

    expect(storedSession?.stepUp?.status).toBe("required");
    expect(storedSession?.stepUp?.attemptsRemaining).toBe(4);
    expect(storedPayment?.status).toBe("pending");
    expect(storedPayment?.stepUpAttemptsRemaining).toBe(4);
  });

  it("verifies the correct email code and returns the provider redirect", async () => {
    const session = await createPaymentAuthorizationSession({
      actor: {
        participantId: "person_mina",
        participantName: "Mina",
        participantEmail: "mina@example.com"
      },
      tripId: "trip_1",
      fromParticipantId: "person_mina",
      toParticipantId: "person_joon",
      amount: 33000,
      provider: "bank-transfer"
    });

    const sentCode = emailMockState.sendStepUpVerificationEmail.mock.calls[0][0].code;
    const verified = await verifyStepUpChallenge({
      actor: {
        participantId: "person_mina",
        participantName: "Mina",
        participantEmail: "mina@example.com"
      },
      sessionId: session.sessionId,
      clientPaymentId: session.paymentId,
      challengeId: session.stepUpChallengeId,
      code: sentCode
    });

    expect(verified.authorizationStatus).toBe("step_up_verified");
    expect(verified.stepUpStatus).toBe("verified");
    expect(verified.stepUpAttemptsRemaining).toBe(5);
    expect(verified.redirectUrl).toContain("/api/mock-provider/authorize");
    expect(verified.redirectUrl).toContain(`sessionId=${session.sessionId}`);
    expect(verified.redirectUrl).toContain(`state=${session.stateNonce}`);

    const storedSession = sessionStoreState.sessions.get(session.sessionId);
    const storedPayment = tripRepositoryState.payments.get(paymentKey("trip_1", session.paymentId));

    expect(storedSession?.authorizationStatus).toBe("step_up_verified");
    expect(storedSession?.stepUp?.status).toBe("verified");
    expect(storedSession?.stepUp?.verifiedAt).toBeTruthy();
    expect(storedPayment?.status).toBe("redirected");
    expect(storedPayment?.authorizationStatus).toBe("step_up_verified");
    expect(storedPayment?.stepUpStatus).toBe("verified");
    expect(storedPayment?.stepUpVerifiedAt).toBeTruthy();
    expect(storedPayment?.redirectUrl).toBe(verified.redirectUrl);
  });
});
