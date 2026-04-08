"use client";

import { useRouter } from "next/navigation";
import { TripDetailsForm } from "@/components/forms/trip-details-form";
import { useTripStore } from "@/lib/store";

export function EditTripForm({ trip }) {
  const router = useRouter();
  const { updateTrip } = useTripStore();

  return (
    <TripDetailsForm
      cancelHref={`/trip/${trip.id}`}
      initialTrip={trip}
      intro="Correct traveler names, fix email typos, and update the trip basics without recreating the whole shared room."
      onSubmit={async (input) => {
        await updateTrip(trip.id, input);
        router.push(`/trip/${trip.id}`);
      }}
      submitLabel="Save trip details"
      submittingLabel="Saving trip details..."
    />
  );
}
