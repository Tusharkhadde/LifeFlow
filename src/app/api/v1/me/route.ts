import { NextRequest } from "next/server";
import { v1Fail, v1Json, v1Options, withV1Auth } from "@/lib/v1-api";

export function OPTIONS(request: NextRequest) {
  return v1Options(request);
}

/** Cheap authenticated ping used by the Chrome extension's Test connection button. */
export async function GET(request: NextRequest) {
  try {
    await withV1Auth(request);
    return v1Json({ ok: true }, 200, request);
  } catch (error) {
    return v1Fail(error, request, "Unauthorized");
  }
}
