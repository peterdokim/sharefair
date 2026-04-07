"use client";

import Link from "next/link";
import { formatCurrency, formatDateRange, getTripStatus, getTripTotal } from "@/lib/trip-helpers";

export function TripCard({ trip, onDelete, isDeleting = false }) {
  return (
    <article className="trip-card-shell">
      <Link className="trip-card" href={`/trip/${trip.id}`}>
        <div className="trip-card-top">
          <div>
            <span className="badge badge-soft">{trip.location || "Group trip"}</span>
            <h2>{trip.name}</h2>
          </div>
          <span className="badge">{getTripStatus(trip)}</span>
        </div>
        <p className="trip-meta">{formatDateRange(trip.startDate, trip.endDate)}</p>
        <div className="trip-stats">
          <div>
            <span>Total tracked</span>
            <strong>{formatCurrency(getTripTotal(trip))}</strong>
          </div>
          <div>
            <span>Travelers</span>
            <strong>{trip.participants.length}</strong>
          </div>
          <div>
            <span>Expenses</span>
            <strong>{trip.expenses.length}</strong>
          </div>
        </div>
      </Link>
      {onDelete ? (
        <div className="trip-card-actions">
          <button className="secondary-button" disabled={isDeleting} onClick={() => onDelete(trip)} type="button">
            {isDeleting ? "Deleting..." : "Delete trip"}
          </button>
        </div>
      ) : null}
    </article>
  );
}
