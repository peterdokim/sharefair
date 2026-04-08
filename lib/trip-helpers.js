const currencyFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function toValidDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCurrency(amount) {
  return currencyFormatter.format(Math.round(amount || 0));
}

export function formatPercent(value) {
  return percentFormatter.format(clamp(Number(value || 0), 0, 1));
}

export function formatDateRange(startDate, endDate) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  });

  if (!startDate || !endDate) {
    return "Dates TBD";
  }

  return `${formatter.format(new Date(startDate))} - ${formatter.format(new Date(endDate))}`;
}

export function formatDateTime(value) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatDateTimeInputValue(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

export function formatDurationMinutes(totalMinutes) {
  const safeMinutes = Math.max(Math.round(Number(totalMinutes || 0)), 0);

  if (!safeMinutes) {
    return "On time";
  }

  if (safeMinutes < 60) {
    return `${safeMinutes}m late`;
  }

  if (safeMinutes < 24 * 60) {
    const hours = Math.floor(safeMinutes / 60);
    const minutes = safeMinutes % 60;
    return minutes ? `${hours}h ${minutes}m late` : `${hours}h late`;
  }

  const days = Math.floor(safeMinutes / (24 * 60));
  const hours = Math.floor((safeMinutes % (24 * 60)) / 60);
  return hours ? `${days}d ${hours}h late` : `${days}d late`;
}

export function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function getTripTotal(trip) {
  return trip.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
}

export function getExpenseLineItems(expense) {
  return Array.isArray(expense.lineItems) ? expense.lineItems : [];
}

export function getExpenseLineItemsTotal(expense) {
  return getExpenseLineItems(expense).reduce((sum, item) => sum + Number(item.amount || 0), 0);
}

export function getExpenseShares(expense) {
  if (!expense.participantIds.length) {
    return {};
  }

  if (expense.splitType === "custom") {
    return expense.participantIds.reduce((shares, participantId) => {
      shares[participantId] = Number(expense.customShares?.[participantId] || 0);
      return shares;
    }, {});
  }

  const equalShare = Number(expense.amount || 0) / expense.participantIds.length;

  return expense.participantIds.reduce((shares, participantId, index) => {
    if (index === expense.participantIds.length - 1) {
      const assigned = Object.values(shares).reduce((sum, amount) => sum + amount, 0);
      shares[participantId] = Number(expense.amount || 0) - assigned;
      return shares;
    }

    shares[participantId] = Math.round(equalShare);
    return shares;
  }, {});
}

export function getParticipantSummaries(trip) {
  const payments = getTripPayments(trip);

  return trip.participants.map((participant) => {
    const paid = trip.expenses
      .filter((expense) => expense.paidBy === participant.id)
      .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

    const share = trip.expenses.reduce((sum, expense) => {
      const shares = getExpenseShares(expense);
      return sum + Number(shares[participant.id] || 0);
    }, 0);

    const sent = payments
      .filter((payment) => payment.status === "confirmed" && payment.fromParticipantId === participant.id)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    const received = payments
      .filter((payment) => payment.status === "confirmed" && payment.toParticipantId === participant.id)
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    const net = paid - share + sent - received;

    return {
      ...participant,
      paid,
      share,
      sent,
      received,
      net
    };
  });
}

function getReliabilityTier(score, historyCount, scoredRequestCount) {
  if (!historyCount) {
    return "No history yet";
  }

  if (!scoredRequestCount) {
    return "Awaiting first deadline";
  }

  if (score >= 85) {
    return "Rock solid";
  }

  if (score >= 70) {
    return "Reliable";
  }

  if (score >= 55) {
    return "Watchlist";
  }

  return "At risk";
}

function getSettlementReliabilityEvent(request, now) {
  const dueAt = toValidDate(request?.dueAt);

  if (!dueAt) {
    return null;
  }

  const completedAt =
    toValidDate(request?.paidAt) || toValidDate(request?.confirmedAt) || toValidDate(request?.settledAt);

  if (!completedAt && dueAt.getTime() > now.getTime()) {
    return null;
  }

  const referenceTime = completedAt || now;
  const latenessMinutes = Math.max(
    Math.round((referenceTime.getTime() - dueAt.getTime()) / (1000 * 60)),
    0
  );

  return {
    dueAt: dueAt.toISOString(),
    completedAt: completedAt?.toISOString() || null,
    latenessMinutes,
    onTime: Boolean(completedAt) && latenessMinutes === 0
  };
}

export function getParticipantReliabilitySummary(participantId, settlementRequests, nowInput = new Date()) {
  const now = toValidDate(nowInput) || new Date();
  const requests = Array.isArray(settlementRequests)
    ? settlementRequests.filter((request) => request.fromParticipantId === participantId)
    : [];
  const scoredRequests = requests
    .map((request) => getSettlementReliabilityEvent(request, now))
    .filter(Boolean)
    .sort((left, right) => new Date(right.dueAt) - new Date(left.dueAt));
  const onTimeCount = scoredRequests.filter((request) => request.onTime).length;
  const rawOnTimeRate = scoredRequests.length ? onTimeCount / scoredRequests.length : null;
  const averageLatenessMinutes = scoredRequests.length
    ? Math.round(
        scoredRequests.reduce((sum, request) => sum + request.latenessMinutes, 0) / scoredRequests.length
      )
    : null;

  let currentStreak = 0;

  for (const request of scoredRequests) {
    if (!request.onTime) {
      break;
    }

    currentStreak += 1;
  }

  const scoringOnTimeRate = scoredRequests.length ? (onTimeCount + 1) / (scoredRequests.length + 2) : 0.5;
  const latenessScore = scoredRequests.length
    ? 1 / (1 + Number(averageLatenessMinutes || 0) / (24 * 60))
    : 0.5;
  const streakScore = scoredRequests.length ? Math.min(currentStreak, 4) / 4 : 0.5;
  const score = Math.round((scoringOnTimeRate * 0.5 + latenessScore * 0.3 + streakScore * 0.2) * 100);

  return {
    score,
    tier: getReliabilityTier(score, requests.length, scoredRequests.length),
    historyCount: requests.length,
    scoredRequestCount: scoredRequests.length,
    onTimeCount,
    onTimeRate: rawOnTimeRate,
    averageLatenessMinutes,
    currentStreak
  };
}

export function getParticipantReliabilityLeaderboard(trip, settlementRequests, nowInput = new Date()) {
  return getParticipantSummaries(trip)
    .map((participant) => ({
      ...participant,
      reliability: getParticipantReliabilitySummary(participant.id, settlementRequests, nowInput)
    }))
    .sort((left, right) => {
      if (right.reliability.score !== left.reliability.score) {
        return right.reliability.score - left.reliability.score;
      }

      if (right.reliability.currentStreak !== left.reliability.currentStreak) {
        return right.reliability.currentStreak - left.reliability.currentStreak;
      }

      if ((right.reliability.onTimeRate || 0) !== (left.reliability.onTimeRate || 0)) {
        return (right.reliability.onTimeRate || 0) - (left.reliability.onTimeRate || 0);
      }

      if (right.net !== left.net) {
        return right.net - left.net;
      }

      return left.name.localeCompare(right.name);
    })
    .map((participant, index) => ({
      ...participant,
      reliability: {
        ...participant.reliability,
        rank: index + 1
      }
    }));
}

export function getSettlementPlan(trip) {
  const summaries = getParticipantSummaries(trip);
  const creditors = summaries
    .filter((participant) => participant.net > 0)
    .map((participant) => ({ ...participant, balance: participant.net }))
    .sort((left, right) => right.balance - left.balance);

  const debtors = summaries
    .filter((participant) => participant.net < 0)
    .map((participant) => ({ ...participant, balance: Math.abs(participant.net) }))
    .sort((left, right) => right.balance - left.balance);

  const transfers = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.balance, debtor.balance);

    transfers.push({
      from: debtor,
      to: creditor,
      amount
    });

    creditor.balance -= amount;
    debtor.balance -= amount;

    if (creditor.balance <= 0) {
      creditorIndex += 1;
    }

    if (debtor.balance <= 0) {
      debtorIndex += 1;
    }
  }

  return transfers;
}

export function getTripStatus(trip) {
  const transfers = getSettlementPlan(trip);
  return transfers.length === 0 ? "Settled" : `${transfers.length} pending`;
}

export function getUnsettledTripCount(trips) {
  return trips.filter((trip) => getSettlementPlan(trip).length > 0).length;
}

export function getParticipantName(trip, participantId) {
  return trip.participants.find((participant) => participant.id === participantId)?.name || "Unknown";
}

export function getTripPayments(trip) {
  return trip.payments || [];
}

export function getPaymentMethodLabel(provider) {
  switch (provider) {
    case "bank-transfer":
      return "Bank transfer";
    case "local-wallet":
      return "Local wallet";
    default:
      return "Payment provider";
  }
}

export function getPaymentStatusLabel(status) {
  switch (status) {
    case "confirmed":
      return "Confirmed";
    case "redirected":
      return "Awaiting provider";
    default:
      return "Pending";
  }
}

export function canExpenseSettleNow(expense) {
  const category = String(expense?.category || "").trim().toLowerCase();
  return category === "food" || category === "transport";
}

export function getSettlementContractDescription(expenseCategory, payerName = "the payer") {
  const category = String(expenseCategory || "").trim().toLowerCase();

  if (category === "food" || category === "transport") {
    return `Because this is a ${category} cost, ${payerName} can enforce a due time and Smart Contract will email the group immediately, then ping again 3 hours and 15 minutes before the deadline.`;
  }

  return "Settle now enforcement is only available for food and transportation expenses in this version.";
}

export function getSettlementRequestStatusLabel(status) {
  switch (status) {
    case "paid":
      return "Paid by debtor";
    case "confirmed":
      return "Confirmed by creditor";
    case "settled":
      return "Bill settled";
    case "overdue":
      return "Overdue";
    default:
      return "Pending";
  }
}

export function getSortedSettlementRequests(requests) {
  return [...(Array.isArray(requests) ? requests : [])].sort(
    (left, right) => new Date(left.dueAt || left.createdAt || 0) - new Date(right.dueAt || right.createdAt || 0)
  );
}

export function getSettlementExpenseSummary(requests) {
  const items = Array.isArray(requests) ? requests : [];
  const counts = {
    pending: 0,
    overdue: 0,
    paid: 0,
    confirmed: 0,
    settled: 0
  };

  for (const request of items) {
    if (counts[request.status] !== undefined) {
      counts[request.status] += 1;
    }
  }

  return {
    counts,
    total: items.length,
    allConfirmed: items.length > 0 && items.every((request) => ["confirmed", "settled"].includes(request.status)),
    allSettled: items.length > 0 && items.every((request) => request.status === "settled")
  };
}

export function getSortedPaymentLog(trip) {
  return getTripPayments(trip)
    .slice()
    .sort((left, right) => new Date(right.confirmedAt || right.createdAt) - new Date(left.confirmedAt || left.createdAt));
}

export function getExpenseSubtitle(trip, expense) {
  const participantNames = expense.participantIds.map((participantId) => getParticipantName(trip, participantId));

  if (participantNames.length <= 3) {
    return participantNames.join(", ");
  }

  return `${participantNames.slice(0, 3).join(", ")} +${participantNames.length - 3}`;
}

export function getExpenseItemSummary(expense) {
  const items = getExpenseLineItems(expense);

  if (!items.length) {
    return "No item breakdown yet";
  }

  if (items.length === 1) {
    return items[0].name;
  }

  return `${items.length} items recorded`;
}

export function getSplitLabel(expense) {
  if (expense.splitType === "custom") {
    const shares = getExpenseShares(expense);
    const biggestShare = Object.values(shares).sort((left, right) => right - left)[0] || 0;
    const ratio = expense.amount ? biggestShare / expense.amount : 0;

    return `Custom split, up to ${percentFormatter.format(ratio)}`;
  }

  return "Equal split";
}

export function getExpenseById(trip, expenseId) {
  return trip.expenses.find((expense) => expense.id === expenseId);
}
