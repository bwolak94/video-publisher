import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

export async function POST(
  _req: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  const res = await fetch(
    `${API_BASE}/api/scenes/${params.sceneId}/regenerate-visual`,
    { method: "POST" }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
