"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BottomNav } from "@/components/bottom-nav";
import { useTripStore } from "@/lib/store";
import {
  formatCurrency,
  formatDateTime,
  getParticipantName,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getSettlementPlan,
  getSortedPaymentLog
} from "@/lib/trip-helpers";

export default function SettlePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { hydrated, markRemindersSent, trips } = useTripStore();
  const [sentThisSession, setSentThisSession] = useState(false);
  const trip = trips.find((item) => item.id === params.id);

  if (!hydrated) {
    return (
      <AppShell subtitle="We are loading the latest settlement data from the server." title="Loading settle up">
        <p className="muted-copy">Suggested transfers and the payment log will appear as soon as the trip sync completes.</p>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell subtitle="Open a trip room first before settling up." title="Trip not found">
        <Link className="primary-button" href="/">
          Back to home
        </Link>
      </AppShell>
    );
  }

  const transfers = getSettlementPlan(trip);
  const paymentLog = getSortedPaymentLog(trip);
  const confirmedPaymentId = searchParams.get("confirmedPayment");

  function getPendingPayment(transfer) {
    return paymentLog.find(
      (payment) =>
        payment.status !== "confirmed" &&
        payment.fromParticipantId === transfer.from.id &&
        payment.toParticipantId === transfer.to.id
    );
  }

  async function handleSendReminders() {
    try {
      await markRemindersSent(trip.id);
      setSentThisSession(true);
    } catch {
      setSentThisSession(false);
    }
  }

  return (
    <AppShell subtitle={`Neutral reminders for ${trip.name}`} title="Settle up">
      <section className="hero-card">
        <span className="badge badge-soft">Emotional relief</span>
        <h2>The reminder comes from the room, not from one friend.</h2>
        <p>
          This is the core product move: turn repayment from a personal ask into a shared, neutral system event.
        </p>
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Suggested transfers</span>
          <h2>The shortest path to settled</h2>
        </div>
        {transfers.length ? (
          transfers.map((transfer) => {
            const pendingPayment = getPendingPayment(transfer);

            return (
              <div className="settlement-row settlement-card" key={`${transfer.from.id}-${transfer.to.id}`}>
                <div>
                  <strong>{transfer.from.name}</strong>
                  <p>pays {transfer.to.name}</p>
                  {pendingPayment ? (
                    <p className="muted-copy">
                      Existing provider handoff via {getPaymentMethodLabel(pendingPayment.provider)} is still waiting for
                      confirmation.
                    </p>
                  ) : null}
                </div>
                <div className="settlement-actions">
                  <strong>{formatCurrency(transfer.amount)}</strong>
                  {pendingPayment ? (
                    <Link className="secondary-button" href={`/trip/${trip.id}/payments/${pendingPayment.id}`}>
                      Open handoff
                    </Link>
                  ) : (
                    <Link
                      className="primary-button compact"
                      href={{
                        pathname: `/trip/${trip.id}/payments/new`,
                        query: {
                          from: transfer.from.id,
                          to: transfer.to.id,
                          amount: transfer.amount
                        }
                      }}
                    >
                      Pay safely
                    </Link>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="highlight-card valid">
            <span>All settled</span>
            <strong>No outstanding transfers</strong>
          </div>
        )}
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Payment log</span>
          <h2>Provider-verified settlement history</h2>
          <p>Every individual transfer stays visible with a method, status, reference, and timestamp.</p>
        </div>
        {confirmedPaymentId ? (
          <p className="success-copy">Provider confirmation received. The app marked that transfer as confirmed and updated balances.</p>
        ) : null}
        {paymentLog.length ? (
          paymentLog.map((payment) => (
            <article className="log-row" key={payment.id}>
              <div className="log-row-top">
                <div>
                  <strong>
                    {getParticipantName(trip, payment.fromParticipantId)} to {getParticipantName(trip, payment.toParticipantId)}
                  </strong>
                  <p className="muted-copy">
                    {getPaymentMethodLabel(payment.provider)} | Ref {payment.reference}
                  </p>
                </div>
                <span className={`status-badge ${payment.status === "confirmed" ? "status-confirmed" : "status-pending"}`}>
                  {getPaymentStatusLabel(payment.status)}
                </span>
              </div>
              <div className="log-row-meta">
                <span>{formatCurrency(payment.amount)}</span>
                <span>
                  {payment.status === "confirmed"
                    ? `Confirmed ${formatDateTime(payment.confirmedAt)}`
                    : `Started ${formatDateTime(payment.createdAt)}`}
                </span>
              </div>
              {payment.status !== "confirmed" ? (
                <Link className="text-link" href={`/trip/${trip.id}/payments/${payment.id}`}>
                  Return to provider handoff
                </Link>
              ) : null}
            </article>
          ))
        ) : (
          <p className="muted-copy">No provider-backed transfers yet. Start one from the suggestions above.</p>
        )}
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Reminder preview</span>
          <h2>What the app sends</h2>
        </div>
        {transfers.length ? (
          transfers.map((transfer) => (
            <article className="reminder-card" key={`message-${transfer.from.id}-${transfer.to.id}`}>
              <p>
                <strong>To {transfer.from.name}:</strong> Your balance for <strong>{trip.name}</strong> is ready. You owe{" "}
                <strong>{formatCurrency(transfer.amount)}</strong> to {transfer.to.name}.
              </p>
            </article>
          ))
        ) : (
          <p className="muted-copy">No reminder is needed because the group is already balanced.</p>
        )}
        <button className="primary-button" disabled={!transfers.length} onClick={handleSendReminders} type="button">
          Send app reminders
        </button>
        {sentThisSession || trip.remindersSentAt ? (
          <p className="success-copy">Reminders were sent from the room, so no one had to message their friends manually.</p>
        ) : null}
      </section>

      <BottomNav tripId={trip.id} />
    </AppShell>
  );
}
