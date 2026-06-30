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
  quick:    "Quick (5 searches)",
  standard: "Standard (15 searches)",
  deep:     "Deep (25 searches)",
};

export default function CreatePage() {
  const router = useRouter();
  const {
    messages,
    stage,
    isStreaming,
    isResearching,
    researchBrief,
    researchDepth,
    referenceVideoUrl,
    referenceAnalysis,
    outline,
    language,
    voiceProfile,
    uploadedFiles,
    addMessage,
    appendStreamToken,
    setStreaming,
    setStage,
    setOutline,
    updateOutlineBullet,
    setStoryboard,
    setLanguage,
    addFile,
    removeFile,
    setResearchBrief,
    setResearchDepth,
    setResearching,
    setReferenceVideo,
  } = useCreatorStore();

  /** Run research phase then stream the outline */
  const handleSend = useCallback(
    async (text: string, _files: File[]) => {
      addMessage({ role: "user", content: text });

      // ── Phase 1: Research ───────────────────────────────────────────────────
      addMessage({
        role: "assistant",
        content: `Researching "${text}" (${DEPTH_LABELS[researchDepth]})...`,
        isStreaming: true,
      });
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
          // Replace the streaming message with a summary
          const keyCount = brief.keyPoints.length;
          const srcCount = brief.sources.length;
          addMessage({
            role: "assistant",
            content: `Found ${srcCount} sources. Extracted ${keyCount} key findings. Review the brief below, then generate your outline.`,
          });
        } else {
          addMessage({ role: "assistant", content: "Research step skipped. Generating outline directly." });
        }
      } catch {
        addMessage({ role: "assistant", content: "Research step skipped (unavailable). Generating outline directly." });
      } finally {
        setResearching(false);
      }

      // Show research brief — user clicks "Generate Outline" to proceed
      // The outline generation is triggered by handleProceedToOutline
      // so we store the topic in the brief for reference
      if (brief) {
        // Stay in research stage — user reviews brief and clicks proceed
        return;
      }

      // No research result → fall through to outline directly
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
            message: topic,
            language,
            voiceId: voiceProfile.voiceId,
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

        const bullets = fullText
          .split("\n")
          .map((l) => l.replace(/^[-•*]\s*/, "").trim())
          .filter(Boolean);
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
      addMessage({ role: "user", content: "Approved outline. Generating storyboard..." });
      addMessage({ role: "assistant", content: "Generating your storyboard...", isStreaming: true });
      setStreaming(true);

      try {
        const res = await fetch(`${API_BASE}/api/creator/storyboard`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outline: approvedBullets.map((b) => b.text),
            language,
            voiceId: voiceProfile.voiceId,
            researchBrief: researchBrief ?? undefined,
            referenceAnalysis: referenceAnalysis ?? undefined,
            referenceVideoUrl: referenceVideoUrl ?? undefined,
          }),
        });

        const data = await res.json();
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
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="px-6 py-4 border-b bg-white flex items-center justify-between">
        <h1 className="font-semibold text-lg">Creator Mode</h1>
        {/* Research depth selector — visible before research starts */}
        {stage === "chat" && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Research depth:</label>
            <select
              value={researchDepth}
              onChange={(e) => setResearchDepth(e.target.value as SearchDepth)}
              className="text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            >
              {(Object.keys(DEPTH_LABELS) as SearchDepth[]).map((d) => (
                <option key={d} value={d}>{DEPTH_LABELS[d]}</option>
              ))}
            </select>
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Compact reference badge once past chat stage */}
          {stage !== "chat" && referenceAnalysis && (
            <div className="px-4 py-2 border-b bg-indigo-50 flex items-center gap-2 text-xs text-indigo-700">
              <span className="font-medium">Reference:</span>
              <span className="truncate max-w-xs">{referenceAnalysis.sourceUrl}</span>
              <span className="ml-auto bg-indigo-100 px-2 py-0.5 rounded-full">
                {referenceAnalysis.pacing} · {referenceAnalysis.toneProfile}
              </span>
            </div>
          )}
          <ChatHistory messages={messages} />

          {/* Research phase: show spinner while searching */}
          {stage === "research" && isResearching && (
            <div className="px-4 pb-4 text-center text-sm text-gray-500">
              <div className="animate-spin inline-block w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full mr-2" />
              Searching the web...
            </div>
          )}

          {/* Research phase: show brief after search completes */}
          {stage === "research" && !isResearching && researchBrief && (
            <div className="px-4 pb-4">
              <ResearchBriefCard
                brief={researchBrief}
                onProceed={handleProceedToOutline}
                isLoading={isStreaming}
              />
            </div>
          )}

          {stage === "outline" && outline.length > 0 && (
            <div className="px-4 pb-4">
              <OutlineCard
                bullets={outline}
                isStreaming={isStreaming}
                onUpdateBullet={updateOutlineBullet}
                onApprove={handleApprove}
              />
            </div>
          )}

          {stage === "storyboard" && (
            <div className="px-4 pb-4 text-center text-sm text-gray-500">
              <div className="animate-spin inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full mr-2" />
              Generating your storyboard...
            </div>
          )}

          {stage === "chat" && (
            <>
              <div className="px-4 pb-2">
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
      </div>
    </div>
  );
}
