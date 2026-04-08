function toNumber(value) {
  const normalized = String(value || "")
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

function containsKeyword(line, keywords) {
  const normalized = String(line || "").toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function guessCategory(text) {
  const normalized = String(text || "").toLowerCase();

  if (/(taxi|uber|bus|train|subway|metro|transport|fare|airport|station)/.test(normalized)) {
    return "Transport";
  }

  if (/(hotel|guesthouse|airbnb|hostel|stay|lodging)/.test(normalized)) {
    return "Hotel";
  }

  if (/(ticket|museum|activity|tour|admission|show|entry)/.test(normalized)) {
    return "Activity";
  }

  return "Food";
}

function parseLineItem(line, index) {
  const trimmed = String(line || "").trim();

  if (!trimmed || containsKeyword(trimmed, ["total", "subtotal", "tax", "vat", "tip", "service", "change", "cash"])) {
    return null;
  }

  const amountMatch =
    trimmed.match(/^(.*?)(?:\s{2,}|[.\-]{2,}|\s+)(?:krw|won|\$)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)$/i) ||
    trimmed.match(/^(.*?)(?:krw|won|\$)\s*([0-9][0-9,]*(?:\.\d{1,2})?)$/i);

  if (!amountMatch) {
    return null;
  }

  const name = amountMatch[1].trim().replace(/\s+/g, " ");
  const amount = toNumber(amountMatch[2]);

  if (!name || !amount) {
    return null;
  }

  return {
    id: `receipt-line-${Date.now()}-${index}`,
    name,
    amount
  };
}

function findTotal(lines) {
  const totalLine = [...lines].reverse().find((line) => containsKeyword(line, ["grand total", "amount paid", "total"]));

  if (!totalLine) {
    return 0;
  }

  const match = totalLine.match(/([0-9][0-9,]*(?:\.\d{1,2})?)/);
  return match ? toNumber(match[1]) : 0;
}

function findTitle(lines) {
  return (
    lines.find(
      (line) =>
        line.length > 2 &&
        !containsKeyword(line, ["total", "subtotal", "tax", "vat", "tip", "service", "date", "time", "receipt"]) &&
        !/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(line)
    ) || lines[0] || "Imported receipt"
  );
}

export function parseReceiptDraftText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error("Paste receipt text or load a text or PDF receipt first.");
  }

  const lineItems = lines.map(parseLineItem).filter(Boolean);
  const itemizedTotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const detectedTotal = findTotal(lines);
  const amount = detectedTotal || itemizedTotal;

  if (!amount) {
    throw new Error("The receipt draft needs at least one detectable amount.");
  }

  const title = findTitle(lines);
  const category = guessCategory(`${title}\n${lines.join("\n")}`);

  return {
    title,
    category,
    amount,
    notes: "Prefilled from imported receipt text. Review the draft before saving.",
    lineItems
  };
}

async function extractPdfReceiptText(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/receipts/extract", {
    method: "POST",
    body: formData
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Could not extract text from that PDF receipt.");
  }

  return String(payload.text || "");
}

export async function readReceiptSource(file) {
  if (!file) {
    throw new Error("Choose a receipt file first.");
  }

  const textLikeExtensions = /\.(txt|csv)$/i;
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isTextLike = file.type.startsWith("text/") || textLikeExtensions.test(file.name);

  if (isPdf) {
    return extractPdfReceiptText(file);
  }

  if (!isTextLike) {
    throw new Error(
      "This prototype reads text receipts and text-based PDF receipts right now. For screenshots, paste the receipt text into the field below."
    );
  }

  return file.text();
}
