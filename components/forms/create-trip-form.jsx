"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTripStore } from "@/lib/store";

const starterParticipants = [
  { name: "", email: "" },
  { name: "", email: "" }
];

export function CreateTripForm() {
  const router = useRouter();
  const { createTrip } = useTripStore();
  const [form, setForm] = useState({
    name: "",
    location: "",
    startDate: "",
    endDate: ""
  });
  const [participants, setParticipants] = useState(starterParticipants);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  function updateParticipant(index, field, value) {
    setParticipants((current) =>
      current.map((participant, currentIndex) =>
        currentIndex === index
          ? {
              ...participant,
              [field]: value
            }
          : participant
      )
    );
  }

  function addParticipantField() {
    setParticipants((current) => [...current, { name: "", email: "" }]);
  }

  function updateTripDate(field, value) {
    setForm((current) => {
      if (field === "startDate") {
        const nextEndDate = current.endDate && current.endDate < value ? value : current.endDate;

        return {
          ...current,
          startDate: value,
          endDate: nextEndDate
        };
      }

      return {
        ...current,
        [field]: value
      };
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      setError("End date cannot be earlier than the start date.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const tripId = await createTrip({
        ...form,
        participants
      });

      router.push(`/trip/${tripId}`);
    } catch (submitError) {
      setError(submitError.message || "Could not create the trip.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="stack-lg" onSubmit={handleSubmit}>
      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Trip basics</span>
          <h2>Start the shared room</h2>
          <p>Give the trip a name, set the dates, and let the app own the split from the beginning.</p>
        </div>
        <label className="field">
          <span>Trip name</span>
          <input
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Graduation trip"
            required
            type="text"
            value={form.name}
          />
        </label>
        <label className="field">
          <span>Location</span>
          <input
            onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))}
            placeholder="Busan"
            required
            type="text"
            value={form.location}
          />
        </label>
        <div className="field-grid">
          <label className="field">
            <span>Start date</span>
            <input
              onChange={(event) => updateTripDate("startDate", event.target.value)}
              required
              type="date"
              value={form.startDate}
            />
          </label>
          <label className="field">
            <span>End date</span>
            <input
              min={form.startDate || undefined}
              onChange={(event) => updateTripDate("endDate", event.target.value)}
              required
              type="date"
              value={form.endDate}
            />
          </label>
        </div>
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">People</span>
          <h2>Add the group</h2>
          <p>Focus on the real travelers, not a generic audience. Add an email if you want real OTP emails instead of the fallback preview.</p>
        </div>
        {participants.map((participant, index) => (
          <div className="field-grid" key={`traveler-${index}`}>
            <label className="field">
              <span>Traveler {index + 1}</span>
              <input
                onChange={(event) => updateParticipant(index, "name", event.target.value)}
                placeholder={`Friend ${index + 1}`}
                required={index < 2}
                type="text"
                value={participant.name}
              />
            </label>
            <label className="field">
              <span>Email for OTP</span>
              <input
                onChange={(event) => updateParticipant(index, "email", event.target.value)}
                placeholder="friend@example.com"
                type="email"
                value={participant.email}
              />
            </label>
          </div>
        ))}
        <button className="secondary-button" onClick={addParticipantField} type="button">
          Add another friend
        </button>
      </section>
      {error ? <p className="form-error">{error}</p> : null}

      <button className="primary-button" type="submit">
        {isSubmitting ? "Creating trip room..." : "Create trip room"}
      </button>
    </form>
  );
}
