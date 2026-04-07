import "server-only";

import { getRedis, isRedisConfigured } from "@/lib/server/storage-runtime";

const SESSION_TTL_SECONDS = 60 * 15;
const TRANSACTION_TTL_SECONDS = 60 * 60 * 24;

const globalState = globalThis;

if (!globalState.__sharefairPaymentSessions) {
  globalState.__sharefairPaymentSessions = new Map();
}

if (!globalState.__sharefairProviderTransactions) {
  globalState.__sharefairProviderTransactions = new Map();
}

function sessionKey(sessionId) {
  return `sharefair:payment-session:${sessionId}`;
}

function providerTransactionKey(transactionId) {
  return `sharefair:provider-transaction:${transactionId}`;
}

export async function savePaymentSession(session) {
  if (isRedisConfigured()) {
    await getRedis().set(sessionKey(session.id), session, { ex: SESSION_TTL_SECONDS });
    return session;
  }

  globalState.__sharefairPaymentSessions.set(session.id, session);
  return session;
}

export async function getPaymentSession(sessionId) {
  if (!sessionId) {
    return null;
  }

  if (isRedisConfigured()) {
    return (await getRedis().get(sessionKey(sessionId))) || null;
  }

  return globalState.__sharefairPaymentSessions.get(sessionId) || null;
}

export async function saveProviderTransaction(transaction) {
  if (isRedisConfigured()) {
    await getRedis().set(providerTransactionKey(transaction.id), transaction, { ex: TRANSACTION_TTL_SECONDS });
    return transaction;
  }

  globalState.__sharefairProviderTransactions.set(transaction.id, transaction);
  return transaction;
}

export async function getProviderTransaction(transactionId) {
  if (!transactionId) {
    return null;
  }

  if (isRedisConfigured()) {
    return (await getRedis().get(providerTransactionKey(transactionId))) || null;
  }

  return globalState.__sharefairProviderTransactions.get(transactionId) || null;
}
