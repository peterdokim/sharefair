import { formatCurrency, getInitials } from "@/lib/trip-helpers";

export function BalanceRow({ participant }) {
  const status = participant.net > 0 ? "gets back" : participant.net < 0 ? "owes" : "settled";

  return (
    <div className="balance-row">
      <div className="avatar">{getInitials(participant.name)}</div>
      <div className="balance-copy">
        <strong>{participant.name}</strong>
        <span>
          Paid {formatCurrency(participant.paid)} | Share {formatCurrency(participant.share)}
        </span>
        {participant.sent || participant.received ? (
          <span>
            Confirmed payments: sent {formatCurrency(participant.sent)} | received {formatCurrency(participant.received)}
          </span>
        ) : null}
      </div>
      <div className={`balance-amount ${participant.net > 0 ? "positive" : participant.net < 0 ? "negative" : ""}`}>
        <small>{status}</small>
        <strong>{formatCurrency(Math.abs(participant.net))}</strong>
      </div>
    </div>
  );
}
