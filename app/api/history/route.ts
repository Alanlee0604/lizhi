import { loadSharedHistory } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const history = await loadSharedHistory();
  if (!history.ok) {
    return Response.json(
      {
        ok: false,
        architecture: {
          mode: "shared-source",
          migrated: false,
          source: "https://votes.alan0828.cloud/api/state",
        },
        error: history.error,
      },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(history, { headers: { "Cache-Control": "no-store" } });
}
