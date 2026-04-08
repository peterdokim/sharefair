import { describe, expect, it } from "vitest";
import { getSettlementExpenseSummary, getSettlementRequestStatusLabel } from "@/lib/trip-helpers";

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
});
