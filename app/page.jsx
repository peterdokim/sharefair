"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TripCard } from "@/components/trip-card";
import { useTripStore } from "@/lib/store";
import { formatCurrency, getTripTotal, getUnsettledTripCount } from "@/lib/trip-helpers";

export default function HomePage() {
  const { trips, hydrated, error } = useTripStore();
  const totalTracked = trips.reduce((sum, trip) => sum + getTripTotal(trip), 0);
  const unsettledTrips = getUnsettledTripCount(trips);

  return (
    <AppShell
      subtitle="Shared travel costs without turning one friend into the collector."
      title="Trip rooms that handle the awkward part"
      actions={
        <Link className="primary-button compact" href="/trip/new">
          New trip
        </Link>
      }
    >
      <section className="hero-card">
        <span className="badge badge-soft">Prototype focus</span>
        <h2>The app asks for repayment so the friend does not have to.</h2>
        <p>
          Log each cost, include only the people who joined, and let the group see a neutral balance instead of waiting for a
          personal text.
        </p>
        <div className="hero-stats">
          <div>
            <span>Trips tracked</span>
            <strong>{trips.length}</strong>
          </div>
          <div>
            <span>Still unsettled</span>
            <strong>{unsettledTrips}</strong>
          </div>
          <div>
            <span>Total tracked</span>
            <strong>{formatCurrency(totalTracked)}</strong>
          </div>
        </div>
      </section>

      <section className="section-header">
        <div>
          <span className="badge badge-soft">Active trips</span>
          <h2>{hydrated ? "Your shared rooms" : "Loading trip rooms..."}</h2>
        </div>
      </section>

      <div className="stack">
        {error ? (
          <section className="panel empty-state stack">
            <h3>Could not sync your trip rooms</h3>
            <p className="muted-copy">{error}</p>
          </section>
        ) : null}
        {trips.length ? (
          trips.map((trip) => <TripCard key={trip.id} trip={trip} />)
        ) : (
          <section className="panel empty-state stack">
            <h3>No trip rooms yet</h3>
            <p className="muted-copy">Create your first trip to start logging shared expenses and click into each one for details.</p>
            <Link className="primary-button" href="/trip/new">
              Create your first trip
            </Link>
          </section>
        )}
      </div>
    </AppShell>
  );
}
