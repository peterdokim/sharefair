"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useTripStore } from "@/lib/store";
import {
  canExpenseSettleNow,
  formatCurrency,
  formatDateTime,
  formatDateTimeInputValue,
  getExpenseById,
  getExpenseLineItems,
  getExpenseLineItemsTotal,
  getExpenseShares,
  getParticipantName,
  getSettlementContractDescription,
  getSettlementExpenseSummary,
  getSettlementRequestStatusLabel,
  getSortedSettlementRequests,
  getSplitLabel
} from "@/lib/trip-helpers";

export default function ExpenseDetailsPage() {
  const params = useParams();
  const { trips, hydrated } = useTripStore();
  const [dueAt, setDueAt] = useState("");
  const [settlementRequests, setSettlementRequests] = useState([]);
  const [settlementError, setSettlementError] = useState("");
  const [settlementMessage, setSettlementMessage] = useState("");
  const [loadingSettlementRequests, setLoadingSettlementRequests] = useState(false);
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState(false);
  const [actingRequestId, setActingRequestId] = useState("");
  const [isSettlingBill, setIsSettlingBill] = useState(false);
  const trip = trips.find((item) => item.id === params.id);
  const expense = trip ? getExpenseById(trip, params.expenseId) : null;

  useEffect(() => {
    if (!expense || !canExpenseSettleNow(expense)) {
      return;
    }

    const defaultDue = new Date(Date.now() + 6 * 60 * 60 * 1000);
    setDueAt(formatDateTimeInputValue(defaultDue.toISOString()));
  }, [expense]);

  useEffect(() => {
    if (!hydrated || !trip?.id || !expense?.id) {
      return;
    }

    let isActive = true;

    async function loadSettlementRequests() {
      setLoadingSettlementRequests(true);

      try {
        const response = await fetch(`/api/trips/${trip.id}/expenses/${expense.id}/settlement-requests`, {
          cache: "no-store"
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Could not load the settlement requests for this expense.");
        }

        if (!isActive) {
          return;
        }

        setSettlementRequests(getSortedSettlementRequests(payload.settlementRequests || []));
      } catch (error) {
        if (!isActive) {
          return;
        }

        setSettlementError(error.message || "Could not load the settlement requests for this expense.");
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
  }, [expense?.id, hydrated, trip?.id]);

  if (!hydrated) {
    return (
      <AppShell subtitle="We are loading the latest expense data from the server." title="Loading expense">
        <p className="muted-copy">This expense will open once the current trip details finish syncing.</p>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell subtitle="Open a trip room first before reviewing an expense." title="Trip not found">
        <Link className="primary-button" href="/">
          Back to home
        </Link>
      </AppShell>
    );
  }

  if (!expense) {
    return (
      <AppShell subtitle={`We could not find that expense inside ${trip.name}.`} title="Expense not found">
        <Link className="primary-button" href={`/trip/${trip.id}`}>
          Back to trip
        </Link>
      </AppShell>
    );
  }

  const lineItems = getExpenseLineItems(expense);
  const lineItemsTotal = getExpenseLineItemsTotal(expense);
  const shares = getExpenseShares(expense);
  const remainingUnitemized = Math.max(Number(expense.amount || 0) - lineItemsTotal, 0);
  const payerName = getParticipantName(trip, expense.paidBy);
  const eligibleForSettleNow = canExpenseSettleNow(expense);
  const settlementSummary = getSettlementExpenseSummary(settlementRequests);

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
    const response = await fetch(`/api/trips/${trip.id}/expenses/${expense.id}/settlement-requests`, {
      cache: "no-store"
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not load the settlement requests for this expense.");
    }

    setSettlementRequests(getSortedSettlementRequests(payload.settlementRequests || []));
  }

  async function handleCreateSettlementRequests(event) {
    event.preventDefault();
    setSettlementError("");
    setSettlementMessage("");

    if (!dueAt) {
      setSettlementError("Choose the exact due date and time before enforcing this payment.");
      return;
    }

    setIsSubmittingSettlement(true);

    try {
      const response = await fetch(`/api/trips/${trip.id}/expenses/${expense.id}/settle-now`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dueAt: new Date(dueAt).toISOString()
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Could not enforce the due-time reminder.");
      }

      setSettlementRequests(getSortedSettlementRequests(payload.settlementRequests || []));
      setSettlementMessage("The social contract is live. Smart Contract emailed each participant and queued follow-up reminders.");
    } catch (error) {
      setSettlementError(error.message || "Could not enforce the due-time reminder.");
    } finally {
      setIsSubmittingSettlement(false);
    }
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
        throw new Error(payload.error || "Could not update this settlement request.");
      }

      await refreshSettlementRequests();
      setSettlementMessage(successMessage);
    } catch (error) {
      setSettlementError(error.message || "Could not update this settlement request.");
    } finally {
      setActingRequestId("");
    }
  }

  async function handleSettleBill() {
    setSettlementError("");
    setSettlementMessage("");
    setIsSettlingBill(true);

    try {
      const response = await fetch(`/api/trips/${trip.id}/expenses/${expense.id}/settle-bill`, {
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Could not mark this bill as settled.");
      }

      setSettlementRequests(getSortedSettlementRequests(payload.settlementRequests || []));
      setSettlementMessage("Every confirmed debt on this bill is now closed, and the creditor marked the bill settled.");
    } catch (error) {
      setSettlementError(error.message || "Could not mark this bill as settled.");
    } finally {
      setIsSettlingBill(false);
    }
  }

  return (
    <AppShell
      showHome={false}
      subtitle={`Expense details for ${trip.name}`}
      title={expense.title}
      actions={
        <Link className="secondary-button" href={`/trip/${trip.id}`}>
          Back to trip
        </Link>
      }
    >
      <section className="hero-card">
        <span className="badge badge-soft">{expense.category}</span>
        <h2>{formatCurrency(expense.amount)}</h2>
        <p>
          Paid by <strong>{getParticipantName(trip, expense.paidBy)}</strong> on {formatDateTime(expense.createdAt)}.
        </p>
      </section>

      <section className="detail-grid">
        <article className="highlight-card">
          <span>Split style</span>
          <strong>{getSplitLabel(expense)}</strong>
        </article>
        <article className="highlight-card">
          <span>Participants</span>
          <strong>{expense.participantIds.length}</strong>
        </article>
        <article className="highlight-card">
          <span>Itemized total</span>
          <strong>{formatCurrency(lineItemsTotal)}</strong>
        </article>
        <article className="highlight-card">
          <span>Unitemized remainder</span>
          <strong>{formatCurrency(remainingUnitemized)}</strong>
        </article>
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Item breakdown</span>
          <h2>What this expense covered</h2>
        </div>
        {lineItems.length ? (
          lineItems.map((item) => (
            <div className="share-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
              </div>
              <strong>{formatCurrency(item.amount)}</strong>
            </div>
          ))
        ) : (
          <p className="muted-copy">No itemized rows were saved for this expense.</p>
        )}
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Per person</span>
          <h2>Who owes what inside this expense</h2>
        </div>
        {expense.participantIds.map((participantId) => (
          <div className="share-row" key={participantId}>
            <div>
              <strong>{getParticipantName(trip, participantId)}</strong>
            </div>
            <strong>{formatCurrency(shares[participantId] || 0)}</strong>
          </div>
        ))}
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Social contract</span>
          <h2>Settle this cost by an exact time</h2>
          <p>{getSettlementContractDescription(expense.category, payerName)}</p>
        </div>

        {eligibleForSettleNow ? (
          <>
            <form className="stack" onSubmit={handleCreateSettlementRequests}>
              <label className="field">
                <span>Exact due time</span>
                <input min={formatDateTimeInputValue(new Date().toISOString())} onChange={(event) => setDueAt(event.target.value)} type="datetime-local" value={dueAt} />
              </label>
              <button className="primary-button" disabled={isSubmittingSettlement} type="submit">
                {isSubmittingSettlement ? "Sending contract..." : "Enforce settle now"}
              </button>
            </form>

            {settlementError ? <p className="form-error">{settlementError}</p> : null}
            {settlementMessage ? <p className="success-copy">{settlementMessage}</p> : null}

            {settlementRequests.length ? (
              <div className="detail-grid">
                <article className="highlight-card">
                  <span>Pending or overdue</span>
                  <strong>{settlementSummary.counts.pending + settlementSummary.counts.overdue}</strong>
                </article>
                <article className="highlight-card">
                  <span>Paid by debtors</span>
                  <strong>{settlementSummary.counts.paid}</strong>
                </article>
                <article className="highlight-card">
                  <span>Confirmed</span>
                  <strong>{settlementSummary.counts.confirmed}</strong>
                </article>
                <article className="highlight-card">
                  <span>Settled</span>
                  <strong>{settlementSummary.counts.settled}</strong>
                </article>
              </div>
            ) : null}

            {loadingSettlementRequests ? (
              <p className="muted-copy">Loading the due-time payment requests for this expense.</p>
            ) : settlementRequests.length ? (
              <>
                {settlementSummary.allConfirmed && !settlementSummary.allSettled ? (
                  <div className="highlight-card valid">
                    <span>Ready to close</span>
                    <strong>Every debt has been confirmed by the creditor</strong>
                    <p className="muted-copy">The creditor can now mark the whole bill as settled.</p>
                    <div className="contract-actions">
                      <button className="primary-button" disabled={isSettlingBill} onClick={handleSettleBill} type="button">
                        {isSettlingBill ? "Closing bill..." : "Mark bill settled"}
                      </button>
                    </div>
                  </div>
                ) : null}

                {settlementRequests.map((request) => (
                  <article className="log-row" key={request.id}>
                    <div className="log-row-top">
                      <div>
                        <strong>
                          {getParticipantName(trip, request.fromParticipantId)} pays {getParticipantName(trip, request.toParticipantId)}
                        </strong>
                        <p className="muted-copy">
                          {request.expenseTitle} | {formatCurrency(request.amount)}
                        </p>
                      </div>
                      <span className={`status-badge ${getSettlementStatusClass(request.status)}`}>
                        {getSettlementRequestStatusLabel(request.status)}
                      </span>
                    </div>
                    <div className="log-row-meta">
                      <span>Due {formatDateTime(request.dueAt)}</span>
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
                                    ? `Initial notice sent ${formatDateTime(request.initialSentAt)}`
                                    : "Awaiting first notice"}
                      </span>
                    </div>
                    <div className="contract-actions">
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
                        <p className="success-copy">This debt is confirmed. Settle the full bill once every debt is confirmed.</p>
                      ) : null}
                    </div>
                  </article>
                ))}
              </>
            ) : (
              <p className="muted-copy">No enforceable payment requests exist for this expense yet.</p>
            )}
          </>
        ) : null}
      </section>

      {expense.notes ? (
        <section className="panel stack">
          <div className="section-copy">
            <span className="badge badge-soft">Notes</span>
            <h2>Extra context</h2>
          </div>
          <p className="detail-note">{expense.notes}</p>
        </section>
      ) : null}
    </AppShell>
  );
}
