import { NextResponse } from "next/server";
import { authorizeMockProviderSession, buildCallbackErrorRedirect } from "@/lib/server/payment-gateway";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");
  const state = searchParams.get("state");

  try {
    const callbackPath = await authorizeMockProviderSession(sessionId, state);
    return NextResponse.redirect(new URL(callbackPath, request.url));
  } catch (error) {
    const redirectPath = await buildCallbackErrorRedirect(sessionId, error.message);
    return NextResponse.redirect(new URL(redirectPath, request.url));
  }
}
