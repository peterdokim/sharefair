"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTripStore } from "@/lib/store";

const starterNames = ["", ""];

export function CreateTripForm() {
  const router = useRouter();
  const { createTrip } = useTripStore();
  const [form, setForm] = useState({
    name: "",
    location: "",
    startDate: "",
    endDate: ""
  });
  const [participants, setParticipants] = useState(starterNames);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  function updateParticipant(index, value) {
    setParticipants((current) => current.map((participant, currentIndex) => (currentIndex === index ? value : participant)));
  }

  function addParticipantField() {
    setParticipants((current) => [...current, ""]);
  }

  async function handleSubmit(event) {
    event.preventDefault();
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
              onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
              required
              type="date"
              value={form.startDate}
            />
          </label>
          <label className="field">
            <span>End date</span>
            <input
              onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))}
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
          <p>Focus on the real travelers, not a generic audience. This is where fairness starts.</p>
        </div>
        {participants.map((participant, index) => (
          <label className="field" key={`traveler-${index}`}>
            <span>Traveler {index + 1}</span>
            <input
              onChange={(event) => updateParticipant(index, event.target.value)}
              placeholder={`Friend ${index + 1}`}
              required={index < 2}
              type="text"
              value={participant}
            />
          </label>
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
