"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BottomNav } from "@/components/bottom-nav";
import { useTripStore } from "@/lib/store";
import {
  canExpenseSettleNow,
  formatCurrency,
  formatDateTime,
  getParticipantName,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getSettlementExpenseSummary,
  getSettlementRequestStatusLabel,
  getSettlementPlan,
  getSortedPaymentLog,
  getSortedSettlementRequests
} from "@/lib/trip-helpers";

export default function SettlePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { hydrated, trips } = useTripStore();
  const [settlementRequests, setSettlementRequests] = useState([]);
  const [settlementError, setSettlementError] = useState("");
  const [settlementMessage, setSettlementMessage] = useState("");
  const [loadingSettlementRequests, setLoadingSettlementRequests] = useState(false);
  const [actingRequestId, setActingRequestId] = useState("");
  const trip = trips.find((item) => item.id === params.id);

  useEffect(() => {
    if (!hydrated || !trip?.id) {
      return;
    }

    let isActive = true;

    async function loadSettlementRequests() {
      setLoadingSettlementRequests(true);

      try {
        const response = await fetch(`/api/trips/${trip.id}/settlement-requests`, {
          cache: "no-store"
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Could not load the settlement contracts.");
        }

        if (!isActive) {
          return;
        }

        setSettlementRequests(getSortedSettlementRequests(payload.settlementRequests || []));
      } catch (error) {
        if (!isActive) {
          return;
        }

        setSettlementError(error.message || "Could not load the settlement contracts.");
      } finally {
        if (isActive) {
          setLoadingSettlementRequests(false);
        }
      }
    }

    void loadSettlementRequests();

    return () => {
      isActive = false;
    };
  }, [hydrated, trip?.id]);

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
  const eligibleExpenseCount = trip.expenses.filter((expense) => canExpenseSettleNow(expense)).length;
  const requestsByExpense = settlementRequests.reduce((groups, request) => {
    groups[request.expenseId] = groups[request.expenseId] || [];
    groups[request.expenseId].push(request);
    return groups;
  }, {});
  const readyToSettleExpenseIds = Object.entries(requestsByExpense)
    .filter(([, requests]) => {
      const summary = getSettlementExpenseSummary(requests);
      return summary.allConfirmed && !summary.allSettled;
    })
    .map(([expenseId]) => expenseId);

  function getPendingPayment(transfer) {
    return paymentLog.find(
      (payment) =>
        payment.status !== "confirmed" &&
        payment.fromParticipantId === transfer.from.id &&
        payment.toParticipantId === transfer.to.id
    );
  }

  function getSettlementStatusClass(status) {
    if (status === "settled") {
      return "status-confirmed";
    }

    if (status === "confirmed") {
      return "status-confirmed";
    }

    if (status === "paid") {
      return "status-paid";
    }

    if (status === "overdue") {
      return "status-overdue";
    }

    return "status-pending";
  }

  async function refreshSettlementRequests() {
    const response = await fetch(`/api/trips/${trip.id}/settlement-requests`, {
      cache: "no-store"
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not load the settlement contracts.");
    }

    setSettlementRequests(getSortedSettlementRequests(payload.settlementRequests || []));
  }

  async function handleSettlementAction(requestId, action, successMessage) {
    setSettlementError("");
    setSettlementMessage("");
    setActingRequestId(requestId);

    try {
      const response = await fetch(`/api/trips/${trip.id}/settlement-requests/${requestId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Could not update this social contract.");
      }

      await refreshSettlementRequests();
      setSettlementMessage(successMessage);
    } catch (error) {
      setSettlementError(error.message || "Could not update this social contract.");
    } finally {
      setActingRequestId("");
    }
  }

  return (
    <AppShell subtitle={`Neutral reminders for ${trip.name}`} title="Settle up">
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
          <span className="badge badge-soft">Social contracts</span>
          <h2>Due-time enforcement for food and transport</h2>
          <p>
            Eligible expenses can turn into enforceable payment requests with an exact deadline, a first email, and follow-up
            pings 3 hours and 15 minutes before the due time.
          </p>
        </div>

        {settlementError ? <p className="form-error">{settlementError}</p> : null}
        {settlementMessage ? <p className="success-copy">{settlementMessage}</p> : null}

        {loadingSettlementRequests ? (
          <p className="muted-copy">Loading the active social contracts for this room.</p>
        ) : settlementRequests.length ? (
          settlementRequests.map((request) => (
            <article className="log-row" key={request.id}>
              <div className="log-row-top">
                <div>
                  <strong>
                    {getParticipantName(trip, request.fromParticipantId)} pays {getParticipantName(trip, request.toParticipantId)}
                  </strong>
                  <p className="muted-copy">
                    {request.expenseTitle} | {request.expenseCategory}
                  </p>
                </div>
                <span className={`status-badge ${getSettlementStatusClass(request.status)}`}>
                  {getSettlementRequestStatusLabel(request.status)}
                </span>
              </div>
              <div className="log-row-meta">
                <span>
                  {formatCurrency(request.amount)} due {formatDateTime(request.dueAt)}
                </span>
                <span>
                  {request.settledAt
                    ? `Bill settled ${formatDateTime(request.settledAt)}`
                    : request.confirmedAt
                      ? `Creditor confirmed ${formatDateTime(request.confirmedAt)}`
                      : request.paidAt
                        ? `Debtor marked paid ${formatDateTime(request.paidAt)}`
                        : request.reminder15mSentAt
                          ? `15-minute ping sent ${formatDateTime(request.reminder15mSentAt)}`
                          : request.reminder3hSentAt
                            ? `3-hour ping sent ${formatDateTime(request.reminder3hSentAt)}`
                            : request.initialSentAt
                              ? `Initial email sent ${formatDateTime(request.initialSentAt)}`
                              : "Initial email pending"}
                </span>
              </div>
              <div className="contract-actions">
                <Link className="text-link" href={`/trip/${trip.id}/expense/${request.expenseId}`}>
                  Open expense
                </Link>

                {["pending", "overdue"].includes(request.status) ? (
                  <button
                    className="secondary-button"
                    disabled={actingRequestId === request.id}
                    onClick={() =>
                      handleSettlementAction(
                        request.id,
                        "mark_paid",
                        `${getParticipantName(trip, request.fromParticipantId)} marked this debt as paid.`
                      )
                    }
                    type="button"
                  >
                    {actingRequestId === request.id ? "Saving..." : "Debtor marked paid"}
                  </button>
                ) : null}

                {request.status === "paid" ? (
                  <button
                    className="primary-button"
                    disabled={actingRequestId === request.id}
                    onClick={() =>
                      handleSettlementAction(
                        request.id,
                        "confirm_payment",
                        `${getParticipantName(trip, request.toParticipantId)} confirmed receiving this payment.`
                      )
                    }
                    type="button"
                  >
                    {actingRequestId === request.id ? "Confirming..." : "Creditor confirm payment"}
                  </button>
                ) : null}

                {request.status === "confirmed" ? (
                  <p className="success-copy">
                    {readyToSettleExpenseIds.includes(request.expenseId)
                      ? "Every debt for this expense is confirmed. Open the expense to settle the bill."
                      : "Confirmed and waiting on the remaining debts for this bill."}
                  </p>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <p className="muted-copy">
            No due-time contracts exist yet. Open a food or transport expense to enforce a payment deadline. {eligibleExpenseCount}{" "}
            eligible expense{eligibleExpenseCount === 1 ? "" : "s"} currently match that rule.
          </p>
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

      <BottomNav tripId={trip.id} />
    </AppShell>
  );
}
