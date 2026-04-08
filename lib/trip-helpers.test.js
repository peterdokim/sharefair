import { describe, expect, it } from "vitest";
import {
  formatDurationMinutes,
  formatPercent,
  getParticipantReliabilityLeaderboard,
  getParticipantReliabilitySummary,
  getSettlementContractDescription,
  getSettlementExpenseSummary,
  getSettlementRequestStatusLabel
} from "@/lib/trip-helpers";

describe("trip helper settlement summaries", () => {
  it("summarizes bill readiness from request states", () => {
    const summary = getSettlementExpenseSummary([
      { status: "confirmed" },
      { status: "settled" }
    ]);

    expect(summary.total).toBe(2);
    expect(summary.allConfirmed).toBe(true);
    expect(summary.allSettled).toBe(false);
  });

  it("maps settlement labels for key states", () => {
    expect(getSettlementRequestStatusLabel("paid")).toBe("Paid by debtor");
    expect(getSettlementRequestStatusLabel("confirmed")).toBe("Confirmed by creditor");
    expect(getSettlementRequestStatusLabel("settled")).toBe("Bill settled");
  });

  it("builds the social contract description for eligible categories", () => {
    expect(getSettlementContractDescription("food", "Kim")).toBe(
      "Because this is a food cost, Kim can enforce a due time and Smart Contract will email the group immediately, then ping again 3 hours and 15 minutes before the deadline."
    );
  });

  it("summarizes reliability from on-time rate, lateness, and streak", () => {
    const summary = getParticipantReliabilitySummary(
      "person_kim",
      [
        {
          fromParticipantId: "person_kim",
          dueAt: "2026-01-02T12:00:00.000Z",
          paidAt: "2026-01-02T11:30:00.000Z"
        },
        {
          fromParticipantId: "person_kim",
          dueAt: "2026-01-01T12:00:00.000Z",
          paidAt: "2026-01-01T11:40:00.000Z"
        }
      ],
      "2026-01-03T12:00:00.000Z"
    );

    expect(summary.score).toBe(78);
    expect(summary.tier).toBe("Reliable");
    expect(summary.historyCount).toBe(2);
    expect(summary.scoredRequestCount).toBe(2);
    expect(summary.onTimeCount).toBe(2);
    expect(summary.onTimeRate).toBe(1);
    expect(summary.averageLatenessMinutes).toBe(0);
    expect(summary.currentStreak).toBe(2);
  });

  it("ranks participants by reliability score from highest to lowest", () => {
    const trip = {
      participants: [
        { id: "person_kim", name: "Kim" },
        { id: "person_lee", name: "Lee" },
        { id: "person_park", name: "Park" }
      ],
      expenses: [],
      payments: []
    };
    const leaderboard = getParticipantReliabilityLeaderboard(
      trip,
      [
        {
          fromParticipantId: "person_kim",
          dueAt: "2026-01-02T12:00:00.000Z",
          paidAt: "2026-01-02T11:30:00.000Z"
        },
        {
          fromParticipantId: "person_kim",
          dueAt: "2026-01-01T12:00:00.000Z",
          paidAt: "2026-01-01T11:40:00.000Z"
        },
        {
          fromParticipantId: "person_lee",
          dueAt: "2026-01-02T12:00:00.000Z",
          paidAt: "2026-01-02T16:00:00.000Z"
        },
        {
          fromParticipantId: "person_lee",
          dueAt: "2026-01-01T12:00:00.000Z",
          status: "overdue"
        }
      ],
      "2026-01-03T12:00:00.000Z"
    );

    expect(leaderboard.map((participant) => participant.name)).toEqual(["Kim", "Park", "Lee"]);
    expect(leaderboard[0].reliability.rank).toBe(1);
    expect(leaderboard[1].reliability.score).toBe(50);
    expect(leaderboard[2].reliability.tier).toBe("At risk");
  });

  it("formats reliability metrics for compact UI copy", () => {
    expect(formatPercent(0.75)).toBe("75%");
    expect(formatDurationMinutes(0)).toBe("On time");
    expect(formatDurationMinutes(135)).toBe("2h 15m late");
  });
});
