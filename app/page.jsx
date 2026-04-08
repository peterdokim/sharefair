"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TripCard } from "@/components/trip-card";
import { useTripStore } from "@/lib/store";
import { formatCurrency, getTripTotal, getUnsettledTripCount } from "@/lib/trip-helpers";

export default function HomePage() {
  const { deleteTrip, trips, hydrated, error } = useTripStore();
  const [actionError, setActionError] = useState("");
  const [deletingTripId, setDeletingTripId] = useState("");
  const totalTracked = trips.reduce((sum, trip) => sum + getTripTotal(trip), 0);
  const unsettledTrips = getUnsettledTripCount(trips);

  async function handleDeleteTrip(trip) {
    const shouldDelete = window.confirm(`Delete ${trip.name}? This will remove its expenses and payment log.`);

    if (!shouldDelete) {
      return;
    }

    setActionError("");
    setDeletingTripId(trip.id);

    try {
      await deleteTrip(trip.id);
    } catch (deleteError) {
      setActionError(deleteError.message || "Could not delete that trip.");
    } finally {
      setDeletingTripId("");
    }
  }

  return (
    <AppShell
      title="Smart Contract"
      actions={
        <Link className="primary-button compact" href="/trip/new">
          New trip
        </Link>
      }
    >
      <section className="hero-card">
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
        {actionError ? <p className="form-error">{actionError}</p> : null}
        {trips.length ? (
          trips.map((trip) => (
            <TripCard
              isDeleting={deletingTripId === trip.id}
              key={trip.id}
              onDelete={handleDeleteTrip}
              trip={trip}
            />
          ))
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
