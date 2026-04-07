import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const SESSION_COOKIE_NAME = "sharefair_mock_actor";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const FALLBACK_SECRET = "sharefair-dev-session-secret";

function getSecret() {
  return process.env.SHAREFAIR_SESSION_SECRET || FALLBACK_SECRET;
}

function toBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload) {
  return createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createActorSessionToken(actor) {
  const payload = JSON.stringify({
    participantId: actor.participantId,
    participantName: actor.participantName,
    issuedAt: new Date().toISOString()
  });
  const encodedPayload = toBase64Url(payload);
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function readActorSessionFromCookie(cookieValue) {
  if (!cookieValue || !cookieValue.includes(".")) {
    return null;
  }

  const [encodedPayload, signature] = cookieValue.split(".");
  const expectedSignature = signPayload(encodedPayload);
  const receivedBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (receivedBuffer.length !== expectedBuffer.length || !timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload));
    const age = Date.now() - new Date(payload.issuedAt).getTime();

    if (!payload.participantId || Number.isNaN(age) || age > SESSION_TTL_MS) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function getActorSession(request) {
  return readActorSessionFromCookie(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

export function attachActorSession(response, actor) {
  response.cookies.set(SESSION_COOKIE_NAME, createActorSessionToken(actor), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000
  });
}

export function clearActorSession(response) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });
}

