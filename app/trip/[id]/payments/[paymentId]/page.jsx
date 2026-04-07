"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useTripStore } from "@/lib/store";
import {
  formatCurrency,
  formatDateTime,
  getParticipantName,
  getPaymentMethodLabel,
  getPaymentStatusLabel
} from "@/lib/trip-helpers";

export default function PaymentProviderPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { hydrated, refreshTrip, trips } = useTripStore();
  const trip = trips.find((item) => item.id === params.id);
  const payment = trip?.payments?.find((item) => item.id === params.paymentId);
  const hasVerifiedCallback = searchParams.get("verified") === "1";
  const callbackError = searchParams.get("callbackError");
  const [code, setCode] = useState("");
  const [stepUpError, setStepUpError] = useState("");
  const [stepUpMessage, setStepUpMessage] = useState("");
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);

  useEffect(() => {
    if (!trip?.id || !hasVerifiedCallback) {
      return;
    }

    void refreshTrip(trip.id);
  }, [hasVerifiedCallback, refreshTrip, trip?.id]);

  if (!hydrated) {
    return (
      <AppShell subtitle="We are loading the latest provider handoff state from the server." title="Loading payment handoff">
        <p className="muted-copy">The verification status and redirect details will appear once the current trip data arrives.</p>
      </AppShell>
    );
  }

  async function handleVerifyCode(event) {
    event.preventDefault();

    if (!trip || !payment) {
      return;
    }

    if (!/^\d{6}$/.test(code)) {
      setStepUpError("Enter the full 6-digit code before verifying.");
      setStepUpMessage("");
      return;
    }

    setIsSubmittingCode(true);
    setStepUpError("");
    setStepUpMessage("");

    try {
      const response = await fetch("/api/payments/step-up/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: payment.authorizationSessionId,
          clientPaymentId: payment.id,
          challengeId: payment.stepUpChallengeId,
          code
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "The email code could not be verified.");
      }

      if (!payload.verified) {
        throw new Error("The email code check did not complete.");
      }

      await refreshTrip(trip.id);
      setCode("");
      setStepUpMessage("Email verification complete. You can continue to the trusted provider now.");
    } catch (error) {
      setStepUpError(error.message || "The email code could not be verified.");
    } finally {
      setIsSubmittingCode(false);
    }
  }

  async function handleResendCode() {
    if (!trip || !payment) {
      return;
    }

    setIsResendingCode(true);
    setStepUpError("");
    setStepUpMessage("");

    try {
      const response = await fetch("/api/payments/step-up/resend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: payment.authorizationSessionId,
          clientPaymentId: payment.id
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "A new email code could not be sent.");
      }

      await refreshTrip(trip.id);
      setCode("");
      setStepUpMessage("A fresh verification code was sent to the same email address.");
    } catch (error) {
      setStepUpError(error.message || "A new email code could not be sent.");
    } finally {
      setIsResendingCode(false);
    }
  }

  if (!trip) {
    return (
      <AppShell subtitle="Open a trip room first before checking a provider handoff." title="Trip not found">
        <Link className="primary-button" href="/">
          Back to home
        </Link>
      </AppShell>
    );
  }

  if (!payment) {
    return (
      <AppShell subtitle={`We could not find that provider handoff inside ${trip.name}.`} title="Payment not found">
        <Link className="primary-button" href={`/trip/${trip.id}/settle`}>
          Back to settle up
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell
      showHome={false}
      subtitle={`Trusted provider handoff for ${trip.name}`}
      title={getPaymentMethodLabel(payment.provider)}
    >
      <section className="hero-card">
        <span className="badge badge-soft">Redirected handoff</span>
        <h2>The transfer is being handled through an external payment provider.</h2>
        <p>
          The app keeps the ledger, but the provider is responsible for the actual movement of money and returns a confirmation
          when it completes.
        </p>
      </section>

      {callbackError ? <p className="form-error">{callbackError}</p> : null}
      {stepUpError ? <p className="form-error">{stepUpError}</p> : null}
      {stepUpMessage ? <p className="success-copy">{stepUpMessage}</p> : null}

      <section className="panel stack">
        <div className="log-row-top">
          <div>
            <span className="badge badge-soft">Provider record</span>
            <h2>{getPaymentMethodLabel(payment.provider)}</h2>
            <p className="muted-copy">Reference {payment.reference}</p>
          </div>
          <span className={`status-badge ${payment.status === "confirmed" ? "status-confirmed" : "status-pending"}`}>
            {getPaymentStatusLabel(payment.status)}
          </span>
        </div>
        <div className="provider-summary-grid">
          <div className="highlight-card">
            <span>Sender</span>
            <strong>{getParticipantName(trip, payment.fromParticipantId)}</strong>
          </div>
          <div className="highlight-card">
            <span>Recipient</span>
            <strong>{getParticipantName(trip, payment.toParticipantId)}</strong>
          </div>
          <div className="highlight-card">
            <span>Amount</span>
            <strong>{formatCurrency(payment.amount)}</strong>
          </div>
          <div className="highlight-card">
            <span>Started</span>
            <strong>{formatDateTime(payment.createdAt)}</strong>
          </div>
          <div className="highlight-card">
            <span>Authorized actor</span>
            <strong>{getParticipantName(trip, payment.authorizedActorId || payment.fromParticipantId)}</strong>
          </div>
          <div className="highlight-card">
            <span>Expires</span>
            <strong>{formatDateTime(payment.authorizationExpiresAt)}</strong>
          </div>
        </div>

        {payment.stepUpRequired && payment.stepUpStatus !== "verified" ? (
          <section className="step-up-panel stack">
            <div className="mail-preview">
              <div className="mail-preview-top">
                <span className="badge badge-soft">Email authenticator</span>
                <span className="status-badge status-pending">Code required</span>
              </div>
              <h3>Your one-time verification code is ready</h3>
              <p>
                We sent a 6-digit code to <strong>{payment.stepUpMaskedEmail || "your verified email"}</strong>. The server
                needs that code before it can unlock the third-party transfer.
              </p>
              <div className="mail-meta">
                <span>Challenge expires {formatDateTime(payment.stepUpExpiresAt)}</span>
                <span>{payment.stepUpAttemptsRemaining} attempts remaining</span>
              </div>
            </div>

            <form className="stack" onSubmit={handleVerifyCode}>
              <label className="field">
                <span>Enter 6-digit code</span>
                <input
                  inputMode="numeric"
                  minLength={6}
                  maxLength={6}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  pattern="\d{6}"
                  placeholder="123456"
                  required
                  type="text"
                  value={code}
                />
              </label>
              <div className="step-up-actions">
                <button className="primary-button" disabled={isSubmittingCode || code.length !== 6} type="submit">
                  {isSubmittingCode ? "Checking code..." : "Verify email code"}
                </button>
                <button className="secondary-button" disabled={isResendingCode} onClick={handleResendCode} type="button">
                  {isResendingCode ? "Sending..." : "Resend code"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {payment.status === "confirmed" ? (
          <p className="success-copy">
            The provider callback was verified server-side, and ShareFair marked this payment confirmed on{" "}
            {formatDateTime(payment.confirmedAt)}.
          </p>
        ) : payment.stepUpRequired && payment.stepUpStatus !== "verified" ? (
          <p className="muted-copy">
            Finish the email authenticator step above to unlock the provider redirect for this transfer.
          </p>
        ) : payment.redirectUrl ? (
          <a className="primary-button" href={payment.redirectUrl}>
            Continue to trusted provider
          </a>
        ) : (
          <p className="form-error">This authorization session is missing its provider redirect URL.</p>
        )}
        {payment.idempotencyKey ? (
          <p className="muted-copy">
            Session {payment.authorizationSessionId} | Idempotency key {payment.idempotencyKey}
          </p>
        ) : null}
        {payment.providerTransactionId ? (
          <p className="muted-copy">Verified provider transaction {payment.providerTransactionId}</p>
        ) : null}
        <Link className="secondary-button" href={`/trip/${trip.id}/settle`}>
          Back to settle up
        </Link>
      </section>
    </AppShell>
  );
}
