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
  formatDateTimeInputValue,
  getExpenseShares,
  getParticipantName,
  getPaymentMethodLabel,
  getPaymentStatusLabel,
  getSettlementContractDescription,
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
  const [creatingExpenseId, setCreatingExpenseId] = useState("");
  const [dueAtByExpenseId, setDueAtByExpenseId] = useState({});
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

  useEffect(() => {
    if (!trip?.expenses?.length) {
      return;
    }

    const defaultDueAt = formatDateTimeInputValue(new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString());

    setDueAtByExpenseId((current) => {
      let hasChange = false;
      const next = { ...current };

      for (const expense of trip.expenses) {
        if (!canExpenseSettleNow(expense) || next[expense.id]) {
          continue;
        }

        next[expense.id] = defaultDueAt;
        hasChange = true;
      }

      return hasChange ? next : current;
    });
  }, [trip?.expenses]);

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
  const requestsByExpense = settlementRequests.reduce((groups, request) => {
    groups[request.expenseId] = groups[request.expenseId] || [];
    groups[request.expenseId].push(request);
    return groups;
  }, {});
  const socialContractExpenses = trip.expenses
    .filter((expense) => {
      if (!canExpenseSettleNow(expense)) {
        return false;
      }

      const shares = getExpenseShares(expense);
      const hasDebtor = expense.participantIds.some(
        (participantId) => participantId !== expense.paidBy && Number(shares[participantId] || 0) > 0
      );

      return hasDebtor || Boolean(requestsByExpense[expense.id]?.length);
    })
    .sort((left, right) => {
      const leftHasLiveContract = (requestsByExpense[left.id] || []).some((request) => request.status !== "settled");
      const rightHasLiveContract = (requestsByExpense[right.id] || []).some((request) => request.status !== "settled");

      if (leftHasLiveContract !== rightHasLiveContract) {
        return leftHasLiveContract ? -1 : 1;
      }

      return new Date(right.createdAt || 0) - new Date(left.createdAt || 0);
    });
  const eligibleExpenseCount = socialContractExpenses.length;
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

  function getSocialContractBadge(requests) {
    const summary = getSettlementExpenseSummary(requests);

    if (summary.allConfirmed && !summary.allSettled) {
      return {
        className: "status-confirmed",
        label: "Ready to close"
      };
    }

    if (summary.counts.overdue) {
      return {
        className: "status-overdue",
        label: "Overdue"
      };
    }

    if (summary.counts.paid) {
      return {
        className: "status-paid",
        label: "Awaiting creditor"
      };
    }

    return {
      className: "status-pending",
      label: requests.length ? "Contract live" : "Ready for due time"
    };
  }

  function getSocialContractProgress(summary) {
    const parts = [];
    const openCount = summary.counts.pending + summary.counts.overdue;

    if (openCount) {
      parts.push(`${openCount} open`);
    }

    if (summary.counts.paid) {
      parts.push(`${summary.counts.paid} marked paid`);
    }

    if (summary.counts.confirmed) {
      parts.push(`${summary.counts.confirmed} confirmed`);
    }

    return parts.join(" | ") || "Ready to send";
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

  function handleDueAtChange(expenseId, value) {
    setDueAtByExpenseId((current) => ({
      ...current,
      [expenseId]: value
    }));
  }

  async function handleCreateSocialContract(event, expense) {
    event.preventDefault();
    const selectedDueAt = dueAtByExpenseId[expense.id];

    setSettlementError("");
    setSettlementMessage("");

    if (!selectedDueAt) {
      setSettlementError("Choose the exact due date and time before sending this social contract.");
      return;
    }

    setCreatingExpenseId(expense.id);

    try {
      const response = await fetch(`/api/trips/${trip.id}/expenses/${expense.id}/settle-now`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dueAt: new Date(selectedDueAt).toISOString()
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Could not enforce the due-time reminder.");
      }

      await refreshSettlementRequests();
      setSettlementMessage(`${expense.title} now has an exact due time. Smart Contract emailed each participant and queued follow-up reminders.`);
    } catch (error) {
      setSettlementError(error.message || "Could not enforce the due-time reminder.");
    } finally {
      setCreatingExpenseId("");
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
          <span className="badge badge-soft">Social contract</span>
          <h2>Settle this cost by an exact time</h2>
          <p>Pick a food or transport expense and set the deadline directly from the settle tab.</p>
        </div>

        {settlementError ? <p className="form-error">{settlementError}</p> : null}
        {settlementMessage ? <p className="success-copy">{settlementMessage}</p> : null}

        {loadingSettlementRequests ? (
          <p className="muted-copy">Loading eligible expenses and their current social contract status.</p>
        ) : socialContractExpenses.length ? (
          socialContractExpenses.map((expense) => {
            const expenseRequests = requestsByExpense[expense.id] || [];
            const liveRequests = expenseRequests.filter((request) => request.status !== "settled");
            const settledRequests = expenseRequests.filter((request) => request.status === "settled");
            const liveSummary = getSettlementExpenseSummary(liveRequests);
            const payerName = getParticipantName(trip, expense.paidBy);
            const shares = getExpenseShares(expense);
            const debtors = expense.participantIds
              .filter(
                (participantId) =>
                  participantId !== expense.paidBy && Number(shares[participantId] || 0) > 0
              )
              .map((participantId) => trip.participants.find((participant) => participant.id === participantId))
              .filter(Boolean);
            const missingEmailNames = debtors
              .filter((participant) => !participant.email)
              .map((participant) => participant.name);
            const hasLiveContract = liveRequests.length > 0;
            const canCreateContract = !hasLiveContract && debtors.length > 0 && missingEmailNames.length === 0;
            const badge = getSocialContractBadge(liveRequests);
            const previousContract = settledRequests[settledRequests.length - 1];

            return (
              <article className="log-row stack" key={expense.id}>
                <div className="log-row-top">
                  <div>
                    <strong>{expense.title}</strong>
                    <p className="muted-copy">
                      {expense.category} | {formatCurrency(expense.amount)} | Paid by {payerName}
                    </p>
                  </div>
                  <span className={`status-badge ${badge.className}`}>{badge.label}</span>
                </div>

                <p className="muted-copy">{getSettlementContractDescription(expense.category, payerName)}</p>

                <div className="log-row-meta">
                  <span>
                    {hasLiveContract
                      ? `Current due time ${formatDateTime(liveRequests[0].dueAt)}`
                      : previousContract?.settledAt
                        ? `Previous contract closed ${formatDateTime(previousContract.settledAt)}`
                        : `${debtors.length} debtor${debtors.length === 1 ? "" : "s"} will get the first email immediately`}
                  </span>
                  <span>
                    {hasLiveContract
                      ? getSocialContractProgress(liveSummary)
                      : missingEmailNames.length
                        ? `Add email for ${missingEmailNames.join(", ")} first`
                        : debtors.length
                          ? "Smart Contract will queue the 3-hour and 15-minute reminders"
                          : "No unpaid share remains on this bill"}
                  </span>
                </div>

                {hasLiveContract ? (
                  <div className="contract-actions">
                    <Link className="text-link" href={`/trip/${trip.id}/expense/${expense.id}`}>
                      Open expense
                    </Link>
                    {liveSummary.allConfirmed && !liveSummary.allSettled ? (
                      <p className="success-copy">Every debtor is confirmed. The creditor can settle the bill now.</p>
                    ) : (
                      <p className="muted-copy">This social contract is already running for the bill.</p>
                    )}
                  </div>
                ) : canCreateContract ? (
                  <form className="stack" onSubmit={(event) => handleCreateSocialContract(event, expense)}>
                    <label className="field">
                      <span>Exact due time</span>
                      <input
                        min={formatDateTimeInputValue(new Date().toISOString())}
                        onChange={(event) => handleDueAtChange(expense.id, event.target.value)}
                        type="datetime-local"
                        value={dueAtByExpenseId[expense.id] || ""}
                      />
                    </label>
                    <div className="contract-actions">
                      <Link className="text-link" href={`/trip/${trip.id}/expense/${expense.id}`}>
                        Open expense
                      </Link>
                      <button className="primary-button" disabled={creatingExpenseId === expense.id} type="submit">
                        {creatingExpenseId === expense.id ? "Sending contract..." : "Enforce settle now"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="contract-actions">
                    <Link className="text-link" href={`/trip/${trip.id}/expense/${expense.id}`}>
                      Open expense
                    </Link>
                    <p className="muted-copy">
                      {missingEmailNames.length
                        ? `Add an email for ${missingEmailNames.join(", ")} before sending the contract.`
                        : "No unpaid debtor share remains on this expense."}
                    </p>
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <p className="muted-copy">
            No food or transport expense with an unpaid share is ready for a due-time contract yet.
          </p>
        )}
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Active social contracts</span>
          <h2>Due-time enforcement in motion</h2>
          <p>Every request stays visible with its exact due time, reminder trail, and confirmation status.</p>
        </div>

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
            No due-time contracts exist yet. {eligibleExpenseCount} eligible expense
            {eligibleExpenseCount === 1 ? "" : "s"} currently match the rule above.
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
