import Link from "next/link";
import { formatCurrency, getExpenseItemSummary, getExpenseSubtitle, getParticipantName, getSplitLabel } from "@/lib/trip-helpers";

export function ExpenseCard({ trip, expense }) {
  return (
    <Link className="panel expense-card expense-card-link" href={`/trip/${trip.id}/expense/${expense.id}`}>
      <div className="expense-card-top">
        <div>
          <span className="badge badge-soft">{expense.category}</span>
          <h3>{expense.title}</h3>
          <p>
            Paid by <strong>{getParticipantName(trip, expense.paidBy)}</strong>
          </p>
        </div>
        <strong>{formatCurrency(expense.amount)}</strong>
      </div>
      <div className="expense-card-bottom">
        <span>{getExpenseSubtitle(trip, expense)}</span>
        <span>{getExpenseItemSummary(expense)}</span>
      </div>
      <div className="expense-card-footer">
        <span>{getSplitLabel(expense)}</span>
        <span className="expense-card-cta">Open details</span>
      </div>
    </Link>
  );
}
