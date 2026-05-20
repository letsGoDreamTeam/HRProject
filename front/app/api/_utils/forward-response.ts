import { NextResponse } from "next/server";

export async function forwardJsonResponse(response: Response) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "application/json";

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "Content-Type": contentType,
    },
  });
}

