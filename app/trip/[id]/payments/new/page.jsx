"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useTripStore } from "@/lib/store";
import { formatCurrency, getParticipantName } from "@/lib/trip-helpers";

const providers = [
  {
    id: "bank-transfer",
    label: "Bank transfer",
    description: "Redirect through a trusted bank handoff, then return with a provider confirmation."
  },
  {
    id: "local-wallet",
    label: "Local wallet",
    description: "Redirect through a trusted wallet handoff while keeping the settlement record in the room."
  }
];

export default function NewPaymentPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hydrated, startPayment, trips } = useTripStore();
  const trip = trips.find((item) => item.id === params.id);
  const [authorizingAs, setAuthorizingAs] = useState("");
  const [error, setError] = useState("");
  const [submittingProvider, setSubmittingProvider] = useState("");
  const fromParticipantId = searchParams.get("from");
  const toParticipantId = searchParams.get("to");
  const amount = Number(searchParams.get("amount"));

  useEffect(() => {
    if (fromParticipantId) {
      setAuthorizingAs(fromParticipantId);
    }
  }, [fromParticipantId]);

  if (!hydrated) {
    return (
      <AppShell subtitle="We are loading the latest trip balances before starting a payment handoff." title="Loading handoff">
        <p className="muted-copy">The sender, receiver, and amount will appear once the trip sync completes.</p>
      </AppShell>
    );
  }

  if (!trip) {
    return (
      <AppShell subtitle="Open a trip room first before starting a payment handoff." title="Trip not found">
        <Link className="primary-button" href="/">
          Back to home
        </Link>
      </AppShell>
    );
  }

  const fromName = getParticipantName(trip, fromParticipantId);
  const toName = getParticipantName(trip, toParticipantId);
  const hasValidTransfer =
    trip.participants.some((participant) => participant.id === fromParticipantId) &&
    trip.participants.some((participant) => participant.id === toParticipantId) &&
    amount > 0;

  async function handleChooseProvider(provider) {
    if (!hasValidTransfer) {
      return;
    }

    const actor = trip.participants.find((participant) => participant.id === authorizingAs);

    if (!actor) {
      setError("Choose who is authorizing this transfer first.");
      return;
    }

    setError("");
    setSubmittingProvider(provider);

    try {
      const authResponse = await fetch("/api/auth/mock-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          participantId: actor.id,
          participantName: actor.name
        })
      });

      const authPayload = await authResponse.json();

      if (!authResponse.ok) {
        throw new Error(authPayload.error || "Could not establish the actor session.");
      }

      const paymentId = await startPayment(trip.id, {
        fromParticipantId,
        toParticipantId,
        amount,
        provider
      });

      router.push(`/trip/${trip.id}/payments/${paymentId}`);
    } catch (requestError) {
      setError(requestError.message || "Could not create the payment authorization session.");
    } finally {
      setSubmittingProvider("");
    }
  }

  if (!hasValidTransfer) {
    return (
      <AppShell subtitle={`The transfer details for ${trip.name} are missing or invalid.`} title="Payment handoff unavailable">
        <Link className="primary-button" href={`/trip/${trip.id}/settle`}>
          Back to settle up
        </Link>
      </AppShell>
    );
  }

  return (
    <AppShell showHome={false} subtitle={`Start a safer handoff for ${trip.name}`} title="Choose a payment provider">
      <section className="hero-card">
        <span className="badge badge-soft">Protected transfer</span>
        <h2>Send the money through a trusted provider, not a vague side conversation.</h2>
        <p>The app records the transfer before the redirect, then waits for confirmation before it updates the room.</p>
      </section>

      <section className="highlight-card">
        <span>Transfer summary</span>
        <strong>
          {fromName} pays {toName}
        </strong>
        <p>{formatCurrency(amount)}</p>
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Authorization check</span>
          <h2>Who is signed in to approve this transfer?</h2>
          <p>The server will only create the payment session if the signed-in actor matches the person sending the money.</p>
        </div>
        <label className="field">
          <span>Authorize as</span>
          <select onChange={(event) => setAuthorizingAs(event.target.value)} value={authorizingAs}>
            {trip.participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="form-error">{error}</p> : null}
      </section>

      <section className="stack">
        {providers.map((provider) => (
          <article className="panel provider-card" key={provider.id}>
            <div className="section-copy">
              <span className="badge badge-soft">Trusted option</span>
              <h2>{provider.label}</h2>
              <p>{provider.description}</p>
            </div>
            <button
              className="primary-button"
              disabled={Boolean(submittingProvider)}
              onClick={() => handleChooseProvider(provider.id)}
              type="button"
            >
              {submittingProvider === provider.id ? "Creating secure session..." : `Continue with ${provider.label}`}
            </button>
          </article>
        ))}
      </section>
    </AppShell>
  );
}
