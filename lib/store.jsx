"use client";

import { createContext, useContext, useEffect, useReducer } from "react";

const TripStoreContext = createContext(null);

function replaceTrip(trips, nextTrip) {
  const existingIndex = trips.findIndex((trip) => trip.id === nextTrip.id);

  if (existingIndex === -1) {
    return [nextTrip, ...trips];
  }

  return trips.map((trip) => (trip.id === nextTrip.id ? nextTrip : trip));
}

function reducer(state, action) {
  switch (action.type) {
    case "LOAD_START":
      return {
        ...state,
        error: ""
      };

    case "LOAD_SUCCESS":
      return {
        trips: action.payload,
        hydrated: true,
        error: ""
      };

    case "LOAD_ERROR":
      return {
        ...state,
        hydrated: true,
        error: action.payload
      };

    case "UPSERT_TRIP":
      return {
        ...state,
        trips: replaceTrip(state.trips, action.payload)
      };

    default:
      return state;
  }
}

async function parseResponse(response, fallbackError) {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || fallbackError);
  }

  return payload;
}

export function TripStoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, {
    trips: [],
    hydrated: false,
    error: ""
  });

  async function refreshTrips() {
    dispatch({ type: "LOAD_START" });

    try {
      const response = await fetch("/api/trips", {
        cache: "no-store"
      });
      const payload = await parseResponse(response, "Could not load trips.");
      dispatch({
        type: "LOAD_SUCCESS",
        payload: Array.isArray(payload.trips) ? payload.trips : []
      });
      return payload.trips || [];
    } catch (error) {
      dispatch({
        type: "LOAD_ERROR",
        payload: error.message || "Could not load trips."
      });
      return [];
    }
  }

  async function refreshTrip(tripId) {
    const response = await fetch(`/api/trips/${tripId}`, {
      cache: "no-store"
    });
    const payload = await parseResponse(response, "Could not load this trip.");
    dispatch({
      type: "UPSERT_TRIP",
      payload: payload.trip
    });
    return payload.trip;
  }

  useEffect(() => {
    let isActive = true;

    async function loadInitialTrips() {
      dispatch({ type: "LOAD_START" });

      try {
        const response = await fetch("/api/trips", {
          cache: "no-store"
        });
        const payload = await parseResponse(response, "Could not load trips.");

        if (!isActive) {
          return;
        }

        dispatch({
          type: "LOAD_SUCCESS",
          payload: Array.isArray(payload.trips) ? payload.trips : []
        });
      } catch (error) {
        if (!isActive) {
          return;
        }

        dispatch({
          type: "LOAD_ERROR",
          payload: error.message || "Could not load trips."
        });
      }
    }

    void loadInitialTrips();

    return () => {
      isActive = false;
    };
  }, []);

  const value = {
    trips: state.trips,
    hydrated: state.hydrated,
    error: state.error,
    refreshTrips,
    refreshTrip,
    async createTrip(input) {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(input)
      });
      const payload = await parseResponse(response, "Could not create the trip.");
      dispatch({
        type: "UPSERT_TRIP",
        payload: payload.trip
      });
      return payload.trip.id;
    },
    async addExpense(tripId, input) {
      const response = await fetch(`/api/trips/${tripId}/expenses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(input)
      });
      const payload = await parseResponse(response, "Could not save the expense.");
      dispatch({
        type: "UPSERT_TRIP",
        payload: payload.trip
      });
      return payload.trip;
    },
    async markRemindersSent(tripId) {
      const response = await fetch(`/api/trips/${tripId}/reminders`, {
        method: "POST"
      });
      const payload = await parseResponse(response, "Could not send reminders.");
      dispatch({
        type: "UPSERT_TRIP",
        payload: payload.trip
      });
      return payload.trip;
    },
    async startPayment(tripId, input) {
      const response = await fetch("/api/payments/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tripId,
          ...input
        })
      });
      const payload = await parseResponse(response, "Could not create the secure payment session.");
      await refreshTrip(tripId);
      return payload.paymentId;
    }
  };

  return <TripStoreContext.Provider value={value}>{children}</TripStoreContext.Provider>;
}

export function useTripStore() {
  const context = useContext(TripStoreContext);

  if (!context) {
    throw new Error("useTripStore must be used inside TripStoreProvider");
  }

  return context;
}
