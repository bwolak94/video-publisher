"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ChatHistory } from "@/components/creator/ChatHistory";
import { ChatInput } from "@/components/creator/ChatInput";
import { OutlineCard } from "@/components/creator/OutlineCard";
import { ResearchBriefCard } from "@/components/creator/ResearchBriefCard";
import { ReferenceVideoInput } from "@/components/creator/ReferenceVideoInput";
import { useCreatorStore } from "@/store/creatorStore";
import type { OutlineBullet } from "@/store/creatorStore";
import type { ResearchBrief, SearchDepth } from "@/types/research";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

const DEPTH_LABELS: Record<SearchDepth, string> = {
  quick:    "Quick",
  standard: "Standard",
  deep:     "Deep",
};

export default function CreatePage() {
  const router = useRouter();
  const {
    messages, stage, isStreaming, isResearching, researchBrief, researchDepth,
    referenceVideoUrl, referenceAnalysis, outline, language, voiceProfile,
    uploadedFiles, addMessage, appendStreamToken, setStreaming, setStage,
    setOutline, updateOutlineBullet, setStoryboard, setLanguage, addFile,
    removeFile, setResearchBrief, setResearchDepth, setResearching, setReferenceVideo,
  } = useCreatorStore();

  const handleSend = useCallback(
    async (text: string, _files: File[]) => {
      addMessage({ role: "user", content: text });

      addMessage({ role: "assistant", content: `Researching "${text}"…`, isStreaming: true });
      setResearching(true);
      setStage("research");

      let brief: ResearchBrief | null = null;
      try {
        const res = await fetch(`${API_BASE}/api/creator/research`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: text, depth: researchDepth }),
        });
        if (res.ok) {
          brief = (await res.json()) as ResearchBrief;
          setResearchBrief(brief);
          addMessage({
            role: "assistant",
            content: `Found ${brief.sources.length} sources. Extracted ${brief.keyPoints.length} key findings. Review the brief below, then generate your outline.`,
          });
        } else {
          addMessage({ role: "assistant", content: "Research step skipped. Generating outline directly." });
        }
      } catch {
        addMessage({ role: "assistant", content: "Research step skipped. Generating outline directly." });
      } finally {
        setResearching(false);
      }

      if (brief) return;
      await generateOutline(text, null);
    },
    [addMessage, researchDepth, setResearchBrief, setResearching, setStage]
  );

  const handleProceedToOutline = useCallback(async () => {
    const topic = researchBrief?.topic ?? "";
    await generateOutline(topic, researchBrief);
  }, [researchBrief]);

  const generateOutline = useCallback(
    async (topic: string, brief: ResearchBrief | null) => {
      addMessage({ role: "assistant", content: "", isStreaming: true });
      setStreaming(true);
      setStage("outline");

      try {
        const res = await fetch(`${API_BASE}/api/creator/outline`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: topic, language, voiceId: voiceProfile.voiceId,
            researchBrief: brief ?? undefined,
            referenceAnalysis: referenceAnalysis ?? undefined,
          }),
        });

        if (!res.ok || !res.body) throw new Error("Stream failed");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          appendStreamToken(chunk);
          fullText += chunk;
        }

        const bullets = fullText.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);
        setOutline(bullets);
      } catch {
        addMessage({ role: "assistant", content: "Something went wrong. Please try again." });
        setStage("chat");
      } finally {
        setStreaming(false);
      }
    },
    [addMessage, appendStreamToken, language, referenceAnalysis, setOutline, setStage, setStreaming, voiceProfile.voiceId]
  );

  const handleApprove = useCallback(
    async (approvedBullets: OutlineBullet[]) => {
      setStage("storyboard");
      addMessage({ role: "user", content: "Approved outline. Generating storyboard…" });
      addMessage({ role: "assistant", content: "Generating your storyboard…", isStreaming: true });
      setStreaming(true);

      try {
        const res = await fetch(`${API_BASE}/api/creator/storyboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outline: approvedBullets.map((b) => b.text), language,
            voiceId: voiceProfile.voiceId,
            researchBrief: researchBrief ?? undefined,
            referenceAnalysis: referenceAnalysis ?? undefined,
            referenceVideoUrl: referenceVideoUrl ?? undefined,
          }),
        });

        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (!data.storyboard || !data.projectId) throw new Error("Invalid storyboard response");
        setStoryboard(data.storyboard);
        router.push(`/project/${data.projectId}/timeline`);
      } catch {
        addMessage({ role: "assistant", content: "Storyboard generation failed. Please try again." });
        setStage("outline");
      } finally {
        setStreaming(false);
      }
    },
    [addMessage, language, referenceAnalysis, referenceVideoUrl, researchBrief, router, setStage, setStoryboard, setStreaming, voiceProfile.voiceId]
  );

  return (
    <div className="flex flex-col h-screen bg-app">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-line bg-panel flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-accent">
            <path d="M7.5 1L9 4.7H13L9.5 7.5L11 11.5L7.5 9L4 11.5L5.5 7.5L2 4.7H6L7.5 1Z" fill="currentColor" />
          </svg>
          <span className="text-sm font-semibold text-ink">Creator Mode</span>
        </div>

        {/* Research depth — pill tabs */}
        {stage === "chat" && (
          <div className="flex items-center gap-0.5 ml-4 bg-subtle rounded-lg p-0.5 border border-line">
            {(Object.keys(DEPTH_LABELS) as SearchDepth[]).map((d) => (
              <button
                key={d}
                onClick={() => setResearchDepth(d)}
                className={`text-xs px-3 py-1.5 rounded-md transition-all duration-100 font-medium ${
                  researchDepth === d
                    ? "bg-accent text-white shadow-sm"
                    : "text-ink-secondary hover:text-ink"
                }`}
              >
                {DEPTH_LABELS[d]}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chat column */}
        <div className="flex flex-col flex-1 overflow-hidden border-r border-line">
          {/* Reference badge */}
          {stage !== "chat" && referenceAnalysis && (
            <div className="px-4 py-2 border-b border-line bg-accent/8 flex items-center gap-2 text-xs text-accent flex-shrink-0">
              <span className="font-medium text-ink-secondary">Reference:</span>
              <span className="truncate max-w-xs text-ink-muted">{referenceAnalysis.sourceUrl}</span>
              <span className="ml-auto bg-accent/15 px-2 py-0.5 rounded-full text-accent border border-accent/20">
                {referenceAnalysis.pacing} · {referenceAnalysis.toneProfile}
              </span>
            </div>
          )}

          <ChatHistory messages={messages} />

          {/* Research spinner */}
          {stage === "research" && isResearching && (
            <div className="px-4 pb-4 text-center text-sm text-ink-secondary flex-shrink-0">
              <div className="animate-spin inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full mr-2" />
              Searching the web…
            </div>
          )}

          {/* Storyboard spinner */}
          {stage === "storyboard" && (
            <div className="px-4 pb-4 text-center text-sm text-ink-secondary flex-shrink-0">
              <div className="animate-spin inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full mr-2" />
              Generating your storyboard…
            </div>
          )}

          {stage === "chat" && (
            <>
              <div className="px-4 pb-2 flex-shrink-0">
                <ReferenceVideoInput
                  apiBase={API_BASE}
                  isDisabled={isStreaming || isResearching}
                  onAnalyzed={(url, brief) => setReferenceVideo(url || null, brief || null)}
                />
              </div>
              <ChatInput
                isStreaming={isStreaming || isResearching}
                language={language}
                uploadedFiles={uploadedFiles}
                onSend={handleSend}
                onLanguageChange={setLanguage}
                onAddFile={addFile}
                onRemoveFile={removeFile}
              />
            </>
          )}
        </div>

        {/* Right panel — research brief / outline */}
        {stage !== "chat" && (stage === "research" || stage === "outline") && (
          <aside className="w-80 flex-shrink-0 bg-panel overflow-y-auto border-l border-line p-4 space-y-4 animate-slide-in">
            {stage === "research" && !isResearching && researchBrief && (
              <ResearchBriefCard
                brief={researchBrief}
                onProceed={handleProceedToOutline}
                isLoading={isStreaming}
              />
            )}
            {stage === "outline" && outline.length > 0 && (
              <OutlineCard
                bullets={outline}
                isStreaming={isStreaming}
                onUpdateBullet={updateOutlineBullet}
                onApprove={handleApprove}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
