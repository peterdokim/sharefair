import { NextResponse } from "next/server";
import { verifyWebhookEvent, verifyWebhookSignature } from "@/lib/server/payment-gateway";

export async function POST(request) {
  const rawPayload = await request.text();
  const signature = request.headers.get("x-sharefair-signature");

  if (!verifyWebhookSignature(rawPayload, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const body = JSON.parse(rawPayload);

  try {
    const session = await verifyWebhookEvent(body);
    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      authorizationStatus: session.authorizationStatus,
      verifiedAt: session.verifiedAt
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status || 500 });
  }
}
