import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

export async function POST(
  req: NextRequest,
  { params }: { params: { sceneId: string } }
) {
  const body = await req.json();
  const res = await fetch(
    `${API_BASE}/api/scenes/${params.sceneId}/set-video-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
