"use client";

import { useRouter } from "next/navigation";
import { TripDetailsForm } from "@/components/forms/trip-details-form";
import { useTripStore } from "@/lib/store";

export function CreateTripForm() {
  const router = useRouter();
  const { createTrip } = useTripStore();

  return (
    <TripDetailsForm
      intro="Give the trip a name, set the dates, and add the traveler details that should stay correct from the very beginning."
      onSubmit={async (input) => {
        const tripId = await createTrip(input);
        router.push(`/trip/${tripId}`);
      }}
      submitLabel="Create trip room"
      submittingLabel="Creating trip room..."
    />
  );
}
