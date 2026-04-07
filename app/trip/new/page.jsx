"use client";

import { AppShell } from "@/components/app-shell";
import { CreateTripForm } from "@/components/forms/create-trip-form";

export default function NewTripPage() {
  return (
    <AppShell showHome={false} subtitle="Build the room first, then let every later expense inherit that shared context." title="Create a new trip">
      <CreateTripForm />
    </AppShell>
  );
}

