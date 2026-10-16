import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { exportAccount } from "@/lib/auth/accounts";
import { rateLimit } from "@/lib/ratelimit";
import { publicError } from "@/lib/errors";

export const dynamic = "force-dynamic";

/** "Download my data": the signed-in person's own records as a JSON file. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await rateLimit(`account-export:${user.id}`, 10, 3600);
    const data = await exportAccount(user.id);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="movents-my-data-${new Date().toISOString().slice(0, 10)}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: publicError(e) }, { status: 429 });
  }
}
