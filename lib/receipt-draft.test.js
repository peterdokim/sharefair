import { describe, expect, it } from "vitest";
import { demoReceipts } from "@/lib/demo-receipts";
import { parseReceiptDraftText } from "@/lib/receipt-draft";

describe("parseReceiptDraftText", () => {
  it("creates a prefilled draft from receipt text", () => {
    const draft = parseReceiptDraftText(`
      Black Pork House
      Pork Set 42000
      Cold Noodles 12000
      Drinks 8000
      Total 62000
    `);

    expect(draft.title).toBe("Black Pork House");
    expect(draft.category).toBe("Food");
    expect(draft.amount).toBe(62000);
    expect(draft.lineItems).toHaveLength(3);
  });

  it("throws when no receipt amounts can be found", () => {
    expect(() => parseReceiptDraftText("Just some notes without prices")).toThrow(
      "The receipt draft needs at least one detectable amount."
    );
  });

  it("parses the built-in demo receipts for the product walkthrough", () => {
    for (const receipt of demoReceipts) {
      const draft = parseReceiptDraftText(receipt.text);

      expect(draft.title).toBeTruthy();
      expect(draft.amount).toBeGreaterThan(0);
    }
  });
});
