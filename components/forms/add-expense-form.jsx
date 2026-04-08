"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { demoReceipts } from "@/lib/demo-receipts";
import { parseReceiptDraftText, readReceiptSource } from "@/lib/receipt-draft";
import { useTripStore } from "@/lib/store";
import { formatCurrency } from "@/lib/trip-helpers";

const categories = ["Hotel", "Food", "Transport", "Activity"];

function toAmount(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function sumShares(customShares, participantIds) {
  return participantIds.reduce((sum, participantId) => sum + toAmount(customShares[participantId]), 0);
}

function splitAmountEvenly(totalAmount, count) {
  if (!count) {
    return [];
  }

  const safeTotal = toAmount(totalAmount);
  const baseShare = safeTotal / count;
  let assigned = 0;

  return Array.from({ length: count }, (_, index) => {
    if (index === count - 1) {
      return safeTotal - assigned;
    }

    const share = Math.round(baseShare);
    assigned += share;
    return share;
  });
}

function createLineItem() {
  return {
    id: `line-${Date.now()}-${Math.round(Math.random() * 100000)}`,
    name: "",
    amount: ""
  };
}

export function AddExpenseForm({ trip }) {
  const router = useRouter();
  const { addExpense } = useTripStore();
  const [form, setForm] = useState({
    title: "",
    category: "Food",
    amount: "",
    paidBy: trip.participants[0]?.id || "",
    participantIds: trip.participants.map((participant) => participant.id),
    splitType: "equal",
    notes: ""
  });
  const [customShares, setCustomShares] = useState(
    trip.participants.reduce((shares, participant) => {
      shares[participant.id] = "";
      return shares;
    }, {})
  );
  const [lineItems, setLineItems] = useState([createLineItem()]);
  const [receiptText, setReceiptText] = useState("");
  const [receiptMessage, setReceiptMessage] = useState("");
  const [isImportingReceipt, setIsImportingReceipt] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amountNumber = Number(form.amount || 0);
  const selectedParticipants = useMemo(() => trip.participants.filter((participant) => form.participantIds.includes(participant.id)), [form.participantIds, trip.participants]);
  const selectedParticipantIds = useMemo(() => selectedParticipants.map((participant) => participant.id), [selectedParticipants]);
  const customTotal = sumShares(customShares, form.participantIds);
  const customBalance = amountNumber - customTotal;
  const lineItemsSubtotal = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const customSplitRows = useMemo(
    () =>
      selectedParticipants.map((participant, index) => {
        const participantIdsBeforeCurrent = selectedParticipantIds.slice(0, index);
        const remainingParticipantCount = selectedParticipantIds.length - index;
        const assignedBeforeCurrent = sumShares(customShares, participantIdsBeforeCurrent);
        const remainingBeforeCurrent = amountNumber - assignedBeforeCurrent;
        const suggestedPlan = splitAmountEvenly(Math.max(remainingBeforeCurrent, 0), remainingParticipantCount);
        const currentValue = customShares[participant.id] ?? "";
        const currentShare = toAmount(currentValue);
        const balanceAfterCurrent = remainingBeforeCurrent - currentShare;

        return {
          participant,
          index,
          remainingParticipantCount,
          remainingBeforeCurrent,
          suggestedShare: suggestedPlan[0] || 0,
          currentValue,
          hasEnteredShare: String(currentValue).length > 0,
          currentShare,
          balanceAfterCurrent
        };
      }),
    [amountNumber, customShares, selectedParticipantIds, selectedParticipants]
  );

  function updateCustomShare(participantId, value) {
    setCustomShares((current) => ({ ...current, [participantId]: value }));
  }

  function applyRemainingSplit(startIndex) {
    setCustomShares((current) => {
      const participantIdsFromCurrent = selectedParticipantIds.slice(startIndex);
      const assignedBeforeCurrent = sumShares(current, selectedParticipantIds.slice(0, startIndex));
      const remainingBeforeCurrent = Math.max(amountNumber - assignedBeforeCurrent, 0);
      const suggestedPlan = splitAmountEvenly(remainingBeforeCurrent, participantIdsFromCurrent.length);
      const next = { ...current };

      participantIdsFromCurrent.forEach((participantId, index) => {
        next[participantId] = String(suggestedPlan[index] || 0);
      });

      return next;
    });
  }

  function toggleParticipant(participantId) {
    setForm((current) => {
      const isSelected = current.participantIds.includes(participantId);
      const participantIds = isSelected
        ? current.participantIds.filter((id) => id !== participantId)
        : [...current.participantIds, participantId];

      return {
        ...current,
        participantIds
      };
    });
  }

  function updateLineItem(lineItemId, field, value) {
    setLineItems((current) =>
      current.map((item) => {
        if (item.id !== lineItemId) {
          return item;
        }

        return {
          ...item,
          [field]: value
        };
      })
    );
  }

  function addLineItemField() {
    setLineItems((current) => [...current, createLineItem()]);
  }

  function removeLineItem(lineItemId) {
    setLineItems((current) => {
      if (current.length === 1) {
        return [createLineItem()];
      }

      return current.filter((item) => item.id !== lineItemId);
    });
  }

  function applyReceiptDraft(draft) {
    setForm((current) => ({
      ...current,
      title: draft.title || current.title,
      category: draft.category || current.category,
      amount: String(draft.amount || current.amount),
      notes: draft.notes || current.notes
    }));
    setLineItems(
      draft.lineItems?.length
        ? draft.lineItems.map((item) => ({
            id: item.id || createLineItem().id,
            name: item.name,
            amount: String(item.amount)
          }))
        : [createLineItem()]
    );
  }

  async function handleReceiptFileChange(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    setReceiptMessage("");

    try {
      const nextReceiptText = await readReceiptSource(file);
      setReceiptText(nextReceiptText);
      setReceiptMessage(`${file.name} is loaded. Create a draft, then review the imported title, amount, and line items.`);
    } catch (receiptError) {
      setError(receiptError.message || "Could not read that receipt file.");
    }
  }

  function handleCreateReceiptDraft() {
    setError("");
    setReceiptMessage("");
    setIsImportingReceipt(true);

    try {
      const draft = parseReceiptDraftText(receiptText);
      applyReceiptDraft(draft);
      setReceiptMessage("Receipt draft created. Review the prefilled expense, assign participants, then save.");
    } catch (receiptError) {
      setError(receiptError.message || "Could not create the receipt draft.");
    } finally {
      setIsImportingReceipt(false);
    }
  }

  function handleLoadDemoReceipt(sample) {
    setError("");
    setReceiptText(sample.text);
    setIsImportingReceipt(true);

    try {
      const draft = parseReceiptDraftText(sample.text);
      applyReceiptDraft(draft);
      setReceiptMessage(`${sample.label} demo loaded. The draft is prefilled so you can show the receipt flow without uploading a real file.`);
    } catch (receiptError) {
      setError(receiptError.message || "Could not load that demo receipt.");
    } finally {
      setIsImportingReceipt(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!form.participantIds.length) {
      setError("Select at least one person for this expense.");
      return;
    }

    if (!amountNumber) {
      setError("Enter the amount that was paid.");
      return;
    }

    if (form.splitType === "custom" && Math.round(customTotal) !== Math.round(amountNumber)) {
      setError("Custom shares need to add up to the full expense.");
      return;
    }

    const normalizedLineItems = lineItems.map((item) => ({
      id: item.id,
      name: item.name.trim(),
      amount: Number(item.amount || 0)
    }));

    const hasPartialLineItems = normalizedLineItems.some(
      (item) => (item.name && !item.amount) || (!item.name && item.amount)
    );

    if (hasPartialLineItems) {
      setError("Each itemized row needs both an item name and an amount.");
      return;
    }

    const completedLineItems = normalizedLineItems.filter((item) => item.name && item.amount);

    if (completedLineItems.reduce((sum, item) => sum + item.amount, 0) > amountNumber) {
      setError("The itemized subtotal cannot be larger than the total expense.");
      return;
    }

    setIsSubmitting(true);

    try {
      await addExpense(trip.id, {
        ...form,
        amount: amountNumber,
        lineItems: completedLineItems,
        customShares: Object.fromEntries(
          form.participantIds.map((participantId) => [participantId, Number(customShares[participantId] || 0)])
        )
      });

      router.push(`/trip/${trip.id}`);
    } catch (submitError) {
      setError(submitError.message || "Could not save the expense.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="stack-lg" onSubmit={handleSubmit}>
      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Receipt import</span>
          <h2>Start from a receipt draft</h2>
          <p>Load text or a text-based PDF receipt, let the app prefill the expense, then review and assign participants before saving.</p>
        </div>
        <label className="field">
          <span>Upload a receipt file</span>
          <input accept=".txt,.csv,.pdf,text/plain,text/csv,application/pdf" onChange={handleReceiptFileChange} type="file" />
        </label>
        <label className="field">
          <span>Or paste receipt text</span>
          <textarea
            onChange={(event) => setReceiptText(event.target.value)}
            placeholder={`Black Pork House\nPork Set 42000\nCold Noodles 12000\nDrinks 8000\nTotal 62000`}
            rows="6"
            value={receiptText}
          />
        </label>
        <div className="stack">
          <span className="field-label">Demo electronic receipts</span>
          <div className="demo-receipt-grid">
            {demoReceipts.map((sample) => (
              <div className="demo-receipt-card" key={sample.id}>
                <div>
                  <strong>{sample.label}</strong>
                  <p>{sample.summary}</p>
                </div>
                <button
                  className="secondary-button"
                  disabled={isImportingReceipt}
                  onClick={() => handleLoadDemoReceipt(sample)}
                  type="button"
                >
                  Use demo receipt
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="contract-actions">
          <button className="primary-button" disabled={isImportingReceipt} onClick={handleCreateReceiptDraft} type="button">
            {isImportingReceipt ? "Reading receipt..." : "Create prefilled draft"}
          </button>
        </div>
        {receiptMessage ? (
          <div className="highlight-card valid">
            <span>Receipt draft</span>
            <strong>Ready for review</strong>
            <p>{receiptMessage}</p>
          </div>
        ) : (
          <p className="muted-copy">
            This prototype now reads text receipts and text-based electronic PDFs. Screenshot OCR can plug into the same draft flow later.
          </p>
        )}
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Expense</span>
          <h2>Log the shared cost</h2>
          <p>The key interaction is choosing who actually joined, so you do not force a fake equal split.</p>
        </div>
        <label className="field">
          <span>Title</span>
          <input
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Black pork dinner"
            required
            type="text"
            value={form.title}
          />
        </label>
        <div className="field-grid">
          <label className="field">
            <span>Category</span>
            <select onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} value={form.category}>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Amount</span>
            <input
              inputMode="numeric"
              min="0"
              onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
              placeholder="60000"
              required
              type="number"
              value={form.amount}
            />
          </label>
        </div>
        <label className="field">
          <span>Paid by</span>
          <select onChange={(event) => setForm((current) => ({ ...current, paidBy: event.target.value }))} value={form.paidBy}>
            {trip.participants.map((participant) => (
              <option key={participant.id} value={participant.id}>
                {participant.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Notes</span>
          <textarea
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="Optional details like table number, tip, or what this expense covered"
            rows="3"
            value={form.notes}
          />
        </label>
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Participants</span>
          <h2>Who joined this one?</h2>
          <p>Leave people out if they skipped the meal or activity. That is what makes the split feel fair.</p>
        </div>
        <div className="pill-grid">
          {trip.participants.map((participant) => {
            const checked = form.participantIds.includes(participant.id);

            return (
              <label className={`check-pill ${checked ? "selected" : ""}`} key={participant.id}>
                <input checked={checked} onChange={() => toggleParticipant(participant.id)} type="checkbox" />
                <span>{participant.name}</span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Items</span>
          <h2>What was actually bought?</h2>
          <p>Add optional line items so each expense can open into a more detailed breakdown later.</p>
        </div>
        <div className="stack">
          {lineItems.map((item, index) => (
            <div className="line-item-row" key={item.id}>
              <label className="field line-item-field">
                <span>Item {index + 1}</span>
                <input
                  onChange={(event) => updateLineItem(item.id, "name", event.target.value)}
                  placeholder="Taxi from station"
                  type="text"
                  value={item.name}
                />
              </label>
              <label className="field line-item-field amount">
                <span>Amount</span>
                <input
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => updateLineItem(item.id, "amount", event.target.value)}
                  placeholder="0"
                  type="number"
                  value={item.amount}
                />
              </label>
              <button className="secondary-button line-item-remove" onClick={() => removeLineItem(item.id)} type="button">
                Remove
              </button>
            </div>
          ))}
          <button className="secondary-button" onClick={addLineItemField} type="button">
            Add item row
          </button>
          <div className="highlight-card">
            <span>Itemized subtotal</span>
            <strong>
              {formatCurrency(lineItemsSubtotal)} / {formatCurrency(amountNumber)}
            </strong>
            <p>Anything not itemized can still be covered by the main total, like tax or service fees.</p>
          </div>
        </div>
      </section>

      <section className="panel stack">
        <div className="section-copy">
          <span className="badge badge-soft">Split</span>
          <h2>Choose how to divide it</h2>
          <p>Use equal when everyone shares evenly, or custom when a few people ordered more or less.</p>
        </div>
        <div className="segmented-control">
          <button
            className={form.splitType === "equal" ? "selected" : ""}
            onClick={() => setForm((current) => ({ ...current, splitType: "equal" }))}
            type="button"
          >
            Equal
          </button>
          <button
            className={form.splitType === "custom" ? "selected" : ""}
            onClick={() => setForm((current) => ({ ...current, splitType: "custom" }))}
            type="button"
          >
            Custom
          </button>
        </div>

        {form.splitType === "equal" ? (
          <div className="highlight-card">
            <span>Per person</span>
            <strong>{selectedParticipants.length ? formatCurrency(amountNumber / selectedParticipants.length) : formatCurrency(0)}</strong>
          </div>
        ) : (
          <div className="stack">
            <p className="muted-copy">Enter the unusual amounts first, then let Smart Contract calculate the remaining people from that point.</p>
            <div className="detail-grid">
              <article className="highlight-card">
                <span>Assigned so far</span>
                <strong>{formatCurrency(customTotal)}</strong>
              </article>
              <article className={`highlight-card ${Math.round(customTotal) === Math.round(amountNumber) ? "valid" : ""}`}>
                <span>{customBalance >= 0 ? "Left to assign" : "Over by"}</span>
                <strong>{formatCurrency(Math.abs(customBalance))}</strong>
              </article>
            </div>

            {customSplitRows.length ? (
              customSplitRows.map((row) => (
                <article className="log-row stack" key={row.participant.id}>
                  <div className="log-row-top">
                    <div>
                      <strong>{row.participant.name}</strong>
                      <p className="muted-copy">
                        {row.remainingBeforeCurrent < 0
                          ? `The split is already over by ${formatCurrency(Math.abs(row.remainingBeforeCurrent))} before this row.`
                          : row.remainingParticipantCount === 1
                            ? `Remainder to balance the bill: ${formatCurrency(row.remainingBeforeCurrent)}.`
                            : `${formatCurrency(row.remainingBeforeCurrent)} is still unassigned. From here, an even split would be ${formatCurrency(row.suggestedShare)} each for ${row.remainingParticipantCount} people.`}
                      </p>
                    </div>
                    <button
                      className="secondary-button compact-button"
                      disabled={row.remainingBeforeCurrent <= 0}
                      onClick={() => applyRemainingSplit(row.index)}
                      type="button"
                    >
                      {row.remainingParticipantCount === 1 ? "Use remainder" : "Split rest equally"}
                    </button>
                  </div>
                  <label className="field">
                    <span>Share for {row.participant.name}</span>
                    <input
                      inputMode="numeric"
                      min="0"
                      onChange={(event) => updateCustomShare(row.participant.id, event.target.value)}
                      placeholder={String(row.suggestedShare || 0)}
                      type="number"
                      value={row.currentValue}
                    />
                  </label>
                  <div className="log-row-meta">
                    <span>
                      {row.hasEnteredShare
                        ? `Current share ${formatCurrency(row.currentShare)}`
                        : "No share entered yet"}
                    </span>
                    <span>
                      {row.balanceAfterCurrent > 0
                        ? `Leaves ${formatCurrency(row.balanceAfterCurrent)} for the remaining people`
                        : row.balanceAfterCurrent === 0
                          ? "This balances the full expense"
                          : `Over by ${formatCurrency(Math.abs(row.balanceAfterCurrent))}`}
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <p className="muted-copy">Select at least one participant to enter a custom split.</p>
            )}
          </div>
        )}
      </section>

      {error ? <p className="form-error">{error}</p> : null}

      <button className="primary-button" type="submit">
        {isSubmitting ? "Saving expense..." : "Save expense"}
      </button>
    </form>
  );
}
