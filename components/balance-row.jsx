import { formatCurrency } from "@/lib/trip-helpers";

export function BalanceRow({ participant }) {
  const status = participant.net > 0 ? "gets back" : participant.net < 0 ? "owes" : "settled";
  const reliability = participant.reliability;
  const highlightClass =
    reliability.rank === 1 ? "balance-row-top-1" : reliability.rank <= 3 ? "balance-row-top-3" : "";

  return (
    <div className={`balance-row ${highlightClass}`}>
      <div className={`rank-number ${reliability.rank === 1 ? "rank-number-top" : ""}`}>{reliability.rank}</div>
      <div className="balance-copy">
        <strong>{participant.name}</strong>
        <span>Reliability score {reliability.score}/100</span>
      </div>
      <div className={`balance-amount ${participant.net > 0 ? "positive" : participant.net < 0 ? "negative" : ""}`}>
        <small>{status}</small>
        <strong>{formatCurrency(Math.abs(participant.net))}</strong>
      </div>
    </div>
  );
}
