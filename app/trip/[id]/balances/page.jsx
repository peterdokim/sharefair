"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BalanceRow } from "@/components/balance-row";
import { BottomNav } from "@/components/bottom-nav";
import { useTripStore } from "@/lib/store";
import { formatCurrency, getParticipantSummaries, getTripTotal } from "@/lib/trip-helpers";

export default function BalancesPage() {
  const params = useParams();
  const { trips, hydrated } = useTripStore();
  const trip = trips.find((item) => item.id === params.id);

  if (!hydrated) {
    return (
      <AppShell subtitle="We are loading the latest shared balances from the server." title="Loading balances">
        <p className="muted-copy">This room will show who owes what as soon as the trip data arrives.</p>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell subtitle="Open a trip room first before reviewing balances." title="Trip not found">
        <Link className="primary-button" href="/">
          Back to home
        </Link>
      </AppShell>
    );
  }

  const summaries = getParticipantSummaries(trip).sort((left, right) => right.net - left.net);

  return (
    <AppShell subtitle={`Shared balances for ${trip.name}`} title="Who owes what">
      <section className="hero-card">
        <span className="badge badge-soft">Fairness view</span>
        <h2>Balances stay visible before resentment has time to build.</h2>
        <p>The goal is to make fairness legible to everyone, not hidden inside one friend&apos;s notes app.</p>
        <div className="hero-stats">
          <div>
            <span>Total tracked</span>
            <strong>{formatCurrency(getTripTotal(trip))}</strong>
          </div>
          <div>
            <span>Travelers</span>
            <strong>{trip.participants.length}</strong>
          </div>
          <div>
            <span>Expense lines</span>
            <strong>{trip.expenses.length}</strong>
          </div>
        </div>
      </section>

      <div className="stack">
        {summaries.map((participant) => (
          <BalanceRow key={participant.id} participant={participant} />
        ))}
      </div>

      <BottomNav tripId={trip.id} />
    </AppShell>
  );
}
