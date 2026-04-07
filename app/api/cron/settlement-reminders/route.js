import { NextResponse } from "next/server";
import { processSettlementReminderQueue } from "@/lib/server/settlement-repository";

function isAuthorized(request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const header = request.headers.get("authorization");
  return header === `Bearer ${configuredSecret}`;
}

async function handleReminderRun(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized cron invocation." }, { status: 401 });
  }

  try {
    const result = await processSettlementReminderQueue();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}

export async function GET(request) {
  return handleReminderRun(request);
}

export async function POST(request) {
  return handleReminderRun(request);
}
