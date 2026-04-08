"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { EditTripForm } from "@/components/forms/edit-trip-form";
import { useTripStore } from "@/lib/store";
import { formatDateRange } from "@/lib/trip-helpers";

export default function EditTripPage() {
  const params = useParams();
  const { trips, hydrated } = useTripStore();
  const trip = trips.find((item) => item.id === params.id);

  if (!hydrated) {
    return (
      <AppShell subtitle="Pulling the saved traveler details before you edit them." title="Loading trip details">
        <p className="muted-copy">We are syncing the latest names, emails, and dates from the server.</p>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell subtitle="This shared room may have been deleted before you could edit it." title="Trip not found">
        <Link className="primary-button" href="/">
          Back to home
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell
      subtitle={`${trip.location || "Group trip"} | ${formatDateRange(trip.startDate, trip.endDate)}`}
      title="Edit trip details"
    >
      <EditTripForm trip={trip} />
    </AppShell>
  );
}
