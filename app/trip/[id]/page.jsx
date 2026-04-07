"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BottomNav } from "@/components/bottom-nav";
import { ExpenseCard } from "@/components/expense-card";
import { useTripStore } from "@/lib/store";
import { formatCurrency, formatDateRange, getParticipantSummaries, getSettlementPlan, getTripTotal } from "@/lib/trip-helpers";

export default function TripPage() {
  const params = useParams();
  const { trips, hydrated } = useTripStore();
  const trip = trips.find((item) => item.id === params.id);

  if (!hydrated) {
    return (
      <AppShell subtitle="We are loading the latest shared room data from the server." title="Loading trip room">
        <p className="muted-copy">Pulling the current expenses, balances, and payment history.</p>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell subtitle="This trip room might have been deleted or never created on this device." title="Trip not found">
        <Link className="primary-button" href="/">
          Back to home
        </Link>
      </AppShell>
    );
  }

  const participants = getParticipantSummaries(trip);
  const settlementPlan = getSettlementPlan(trip);
  const topCreditor = participants.slice().sort((left, right) => right.net - left.net)[0];

  return (
    <AppShell
      subtitle={`${trip.location || "Group trip"} | ${formatDateRange(trip.startDate, trip.endDate)}`}
      title={trip.name}
      actions={
        <Link className="primary-button compact" href={`/trip/${trip.id}/expense/new`}>
          Add expense
        </Link>
      }
    >
      <section className="hero-card">
        <span className="badge badge-soft">Why this matters</span>
        <h2>The planner should not carry the money and the awkwardness.</h2>
        <p>
          This room keeps every uneven cost visible as it happens, so repayment is shared context instead of one private burden.
        </p>
        <div className="hero-stats">
          <div>
            <span>Total spent</span>
            <strong>{formatCurrency(getTripTotal(trip))}</strong>
          </div>
          <div>
            <span>Expenses</span>
            <strong>{trip.expenses.length}</strong>
          </div>
          <div>
            <span>Pending transfers</span>
            <strong>{settlementPlan.length}</strong>
          </div>
        </div>
      </section>

      <section className="highlight-card">
        <span>Most fronted right now</span>
        <strong>{topCreditor?.name || "No one yet"}</strong>
        <p>{topCreditor?.net > 0 ? `${topCreditor.name} is currently owed ${formatCurrency(topCreditor.net)}.` : "No one is fronting money right now."}</p>
      </section>

      <section className="section-header">
        <div>
          <span className="badge badge-soft">Recent expenses</span>
          <h2>What the group has logged</h2>
        </div>
        <Link className="text-link" href={`/trip/${trip.id}/balances`}>
          View balances
        </Link>
      </section>

      <div className="stack">
        {trip.expenses.length ? (
          trip.expenses.map((expense) => <ExpenseCard expense={expense} key={expense.id} trip={trip} />)
        ) : (
          <section className="panel empty-state">
            <h3>No expenses yet</h3>
            <p>Start with the hotel, van, or first meal so the split stays clean from the beginning.</p>
          </section>
        )}
      </div>

      <BottomNav tripId={trip.id} />
    </AppShell>
  );
}
