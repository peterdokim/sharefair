"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { BalanceRow } from "@/components/balance-row";
import { BottomNav } from "@/components/bottom-nav";
import { useTripStore } from "@/lib/store";
import { formatCurrency, getParticipantReliabilityLeaderboard, getTripTotal } from "@/lib/trip-helpers";

export default function BalancesPage() {
  const params = useParams();
  const { trips, hydrated } = useTripStore();
  const [settlementRequests, setSettlementRequests] = useState([]);
  const [loadingReliability, setLoadingReliability] = useState(false);
  const [reliabilityError, setReliabilityError] = useState("");
  const trip = trips.find((item) => item.id === params.id);

  useEffect(() => {
    if (!hydrated || !trip?.id) {
      return;
    }

    let isActive = true;

    async function loadSettlementRequests() {
      setLoadingReliability(true);
      setReliabilityError("");

      try {
        const response = await fetch(`/api/trips/${trip.id}/settlement-requests`, {
          cache: "no-store"
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Could not load the reliability history.");
        }

        if (!isActive) {
          return;
        }

        setSettlementRequests(Array.isArray(payload.settlementRequests) ? payload.settlementRequests : []);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setReliabilityError(error.message || "Could not load the reliability history.");
      } finally {
        if (isActive) {
          setLoadingReliability(false);
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

  const leaderboard = getParticipantReliabilityLeaderboard(trip, settlementRequests);
  const scoredRepaymentCount = leaderboard.reduce(
    (sum, participant) => sum + participant.reliability.scoredRequestCount,
    0
  );

  return (
    <AppShell subtitle={`Shared balances for ${trip.name}`} title="Balances">
      <section className="hero-card">
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
            <span>Scored repayments</span>
            <strong>{scoredRepaymentCount}</strong>
          </div>
        </div>
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <h2>Reliability Rankings</h2>
        </div>
        {loadingReliability ? <p className="muted-copy">Loading social-contract history for the reliability score.</p> : null}
        {reliabilityError ? <p className="form-error">{reliabilityError}</p> : null}
      </section>

      <div className="stack">
        {leaderboard.map((participant) => (
          <BalanceRow key={participant.id} participant={participant} />
        ))}
      </div>

      <BottomNav tripId={trip.id} />
    </AppShell>
  );
}
