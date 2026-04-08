"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function createEmptyParticipant() {
  return {
    id: "",
    name: "",
    email: ""
  };
}

function buildInitialParticipants(participants) {
  if (Array.isArray(participants) && participants.length) {
    return participants.map((participant) => ({
      id: participant.id || "",
      name: participant.name || "",
      email: participant.email || ""
    }));
  }

  return [createEmptyParticipant(), createEmptyParticipant()];
}

export function TripDetailsForm({
  cancelHref = "",
  initialTrip = null,
  intro = null,
  submitLabel,
  submittingLabel,
  onSubmit
}) {
  const initialForm = useMemo(
    () => ({
      name: initialTrip?.name || "",
      location: initialTrip?.location || "",
      startDate: initialTrip?.startDate || "",
      endDate: initialTrip?.endDate || ""
    }),
    [initialTrip]
  );
  const initialParticipants = useMemo(() => buildInitialParticipants(initialTrip?.participants), [initialTrip]);
  const [form, setForm] = useState(initialForm);
  const [participants, setParticipants] = useState(initialParticipants);
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
    setParticipants((current) => [...current, createEmptyParticipant()]);
  }

  function removeParticipantField(index) {
    setParticipants((current) => {
      if (current.length <= 2) {
        return current;
      }

      const target = current[index];

      if (target?.id) {
        return current;
      }

      return current.filter((_, currentIndex) => currentIndex !== index);
    });
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
      await onSubmit({
        ...form,
        participants
      });
    } catch (submitError) {
      setError(submitError.message || "Could not save the trip details.");
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
          <p>{intro || "Give the trip a name, set the dates, and let the app own the split from the beginning."}</p>
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
          <h2>Traveler details</h2>
          <p>Come back here any time to correct names, fix email typos, or add another traveler before the next split.</p>
        </div>
        {participants.map((participant, index) => {
          const canRemove = !participant.id && participants.length > 2;

          return (
            <div className="stack" key={participant.id || `traveler-${index}`}>
              <div className="field-grid">
                <label className="field">
                  <span>Traveler {index + 1}</span>
                  <input
                    onChange={(event) => updateParticipant(index, "name", event.target.value)}
                    placeholder={`Friend ${index + 1}`}
                    required={index < 2 || Boolean(participant.id)}
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
              {canRemove ? (
                <div className="inline-actions">
                  <button className="text-link inline-text-link" onClick={() => removeParticipantField(index)} type="button">
                    Remove this empty row
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
        <button className="secondary-button" onClick={addParticipantField} type="button">
          Add another friend
        </button>
      </section>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="form-actions">
        {cancelHref ? (
          <Link className="secondary-button" href={cancelHref}>
            Cancel
          </Link>
        ) : null}
        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}
