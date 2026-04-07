const currencyFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0
});

export function formatCurrency(amount) {
  return currencyFormatter.format(Math.round(amount || 0));
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

export function getSettlementRequestStatusLabel(status) {
  switch (status) {
    case "settled":
      return "Settled";
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
