import { NextResponse } from "next/server";
import { buildCallbackErrorRedirect, verifyPaymentCallback } from "@/lib/server/payment-gateway";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  try {
    const session = await verifyPaymentCallback({
      sessionId,
      state: searchParams.get("state"),
      providerTransactionId: searchParams.get("providerTransactionId"),
      providerStatus: searchParams.get("providerStatus")
    });

    const redirectUrl = new URL(`/trip/${session.tripId}/payments/${session.clientPaymentId}`, request.url);
    redirectUrl.searchParams.set("verified", "1");
    redirectUrl.searchParams.set("sessionId", session.id);
    redirectUrl.searchParams.set("providerTransactionId", session.providerTransactionId);
    redirectUrl.searchParams.set("authorizationStatus", session.authorizationStatus);
    redirectUrl.searchParams.set("verifiedAt", session.verifiedAt);

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    const redirectPath = await buildCallbackErrorRedirect(sessionId, error.message);
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }
}
