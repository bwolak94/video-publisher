"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BriefComposer, BriefFormData } from "@/components/shorts/BriefComposer";

const MOCK_NICHES = [
  { id: "niche-1", name: "Technologia" },
  { id: "niche-2", name: "Finanse" },
  { id: "niche-3", name: "Lifestyle" },
];

const MOCK_CHARACTERS: { id: string; name: string; consent: string }[] = [];

export default function NewShortPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [moderation, setModeration] = useState<string | undefined>();

  async function handleGenerate(data: BriefFormData) {
    setLoading(true);
    setModeration(undefined);
    try {
      const res = await fetch("/api/shorts/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: data.brief,
          nicheId: data.nicheId,
          characterIds: data.characterIds,
          budgetUsd: data.budgetUsd,
          duration: data.duration,
          shotTrack: data.shotTrack,
          hitl: data.hitl,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.moderation) {
          setModeration(json.moderation as string);
        }
        return;
      }
      router.push(`/shorts/${json.jobId as string}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <BriefComposer
        niches={MOCK_NICHES}
        characters={MOCK_CHARACTERS}
        onGenerate={handleGenerate}
        loading={loading}
        moderation={moderation}
      />
    </div>
  );
}
