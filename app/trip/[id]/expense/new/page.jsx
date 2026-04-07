"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AddExpenseForm } from "@/components/forms/add-expense-form";
import { useTripStore } from "@/lib/store";

export default function NewExpensePage() {
  const params = useParams();
  const { trips, hydrated } = useTripStore();
  const trip = trips.find((item) => item.id === params.id);

  if (!hydrated) {
    return (
      <AppShell subtitle="We are loading the trip room before opening the new expense form." title="Loading trip">
        <p className="muted-copy">The payer list and participant list will appear once the server data arrives.</p>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell subtitle="Open a trip room first before adding an expense." title="Trip not found">
        <Link className="primary-button" href="/">
          Back to home
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell showHome={false} subtitle={`Add a cost to ${trip.name} and select only the people who were actually part of it.`} title="New expense">
      <AddExpenseForm trip={trip} />
    </AppShell>
  );
}
