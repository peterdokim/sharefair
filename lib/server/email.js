import "server-only";

import { Resend } from "resend";

let resendClient = null;

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  }).format(Math.round(Number(amount || 0)));
}

export function isEmailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.SHAREFAIR_EMAIL_FROM);
}

function getResend() {
  if (!isEmailDeliveryConfigured()) {
    throw new Error("Resend is not configured.");
  }

  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  return resendClient;
}

function buildVerificationHtml(input) {
  const tripName = escapeHtml(input.tripName || "your trip");
  const actorName = escapeHtml(input.actorName || "traveler");
  const amount = escapeHtml(formatCurrency(input.amount));
  const code = escapeHtml(input.code);
  const recipientName = escapeHtml(input.recipientName || "your friend");
  const expiresAt = escapeHtml(
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(input.expiresAt))
  );

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f6efe3;padding:32px;color:#24170e">
      <div style="max-width:560px;margin:0 auto;background:#fffaf0;border-radius:24px;padding:32px;border:1px solid rgba(97,61,28,0.12)">
        <p style="margin:0 0 8px;color:#b24b2a;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase">Smart Contract Verification</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.05">Your verification code is ready</h1>
        <p style="margin:0 0 16px;line-height:1.6">
          Hi ${actorName}, use this one-time code to approve a payment for <strong>${tripName}</strong>.
        </p>
        <div style="margin:24px 0;padding:20px;border-radius:20px;background:#f5e6dd;text-align:center">
          <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#7b4a30">6-digit code</div>
          <div style="margin-top:10px;font-size:34px;font-weight:800;letter-spacing:0.22em">${code}</div>
        </div>
        <p style="margin:0 0 12px;line-height:1.6">
          This code is being used to approve <strong>${amount}</strong> to <strong>${recipientName}</strong>.
        </p>
        <p style="margin:0;color:#7a5b43;line-height:1.6">It expires on ${expiresAt}.</p>
      </div>
    </div>
  `;
}

function formatDueDateTime(value) {
  return escapeHtml(
    new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value))
  );
}

function getReminderHeading(type) {
  switch (type) {
    case "initial":
      return "Settle this shared cost by the due time";
    case "3h":
      return "Reminder: 3 hours left to settle this cost";
    case "15m":
      return "Reminder: 15 minutes left to settle this cost";
    default:
      return "Settlement reminder";
  }
}

function getReminderTone(type) {
  switch (type) {
    case "initial":
      return "The payer has set an exact due time for this shared cost.";
    case "3h":
      return "This is your 3-hour reminder before the due time.";
    case "15m":
      return "This is your final 15-minute reminder before the due time.";
    default:
      return "A shared cost is waiting for your payment.";
  }
}

function buildSettlementNoticeHtml(input) {
  const debtorName = escapeHtml(input.debtorName || "traveler");
  const payerName = escapeHtml(input.payerName || "your friend");
  const tripName = escapeHtml(input.tripName || "your trip");
  const expenseTitle = escapeHtml(input.expenseTitle || "shared cost");
  const expenseCategory = escapeHtml(input.expenseCategory || "Expense");
  const amount = escapeHtml(formatCurrency(input.amount));
  const dueAt = formatDueDateTime(input.dueAt);
  const heading = escapeHtml(getReminderHeading(input.type));
  const tone = escapeHtml(getReminderTone(input.type));

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#f6efe3;padding:32px;color:#24170e">
      <div style="max-width:560px;margin:0 auto;background:#fffaf0;border-radius:24px;padding:32px;border:1px solid rgba(97,61,28,0.12)">
        <p style="margin:0 0 8px;color:#145e55;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase">Smart Contract Social Contract</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.05">${heading}</h1>
        <p style="margin:0 0 16px;line-height:1.6">Hi ${debtorName}, ${tone}</p>
        <div style="margin:24px 0;padding:20px;border-radius:20px;background:#edf6f4">
          <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#145e55">${expenseCategory}</div>
          <div style="margin-top:8px;font-size:24px;font-weight:800">${expenseTitle}</div>
          <div style="margin-top:8px;font-size:18px;font-weight:700">${amount}</div>
        </div>
        <p style="margin:0 0 12px;line-height:1.6">
          <strong>${payerName}</strong> fronted this cost for <strong>${tripName}</strong> and set the due time to
          <strong> ${dueAt}</strong>.
        </p>
        <p style="margin:0;color:#7a5b43;line-height:1.6">Smart Contract will keep reminding you as the due time gets closer.</p>
      </div>
    </div>
  `;
}

export async function sendStepUpVerificationEmail(input) {
  const resend = getResend();
  const response = await resend.emails.send({
    from: process.env.SHAREFAIR_EMAIL_FROM,
    to: input.to,
    subject: `Your Smart Contract verification code for ${input.tripName || "your trip"}`,
    html: buildVerificationHtml(input)
  });

  if (response.error) {
    throw new Error(response.error.message || "Could not send the verification email.");
  }

  return response.data || null;
}

export async function sendSettlementNoticeEmail(input) {
  const resend = getResend();
  const response = await resend.emails.send({
    from: process.env.SHAREFAIR_EMAIL_FROM,
    to: input.to,
    subject: `${getReminderHeading(input.type)} for ${input.expenseTitle || "your shared cost"}`,
    html: buildSettlementNoticeHtml(input)
  });

  if (response.error) {
    throw new Error(response.error.message || "Could not send the settlement reminder email.");
  }

  return response.data || null;
}
