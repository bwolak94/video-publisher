"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ChatHistory } from "@/components/creator/ChatHistory";
import { ChatInput } from "@/components/creator/ChatInput";
import { OutlineCard } from "@/components/creator/OutlineCard";
import { useCreatorStore } from "@/store/creatorStore";
import type { OutlineBullet } from "@/store/creatorStore";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

export default function CreatePage() {
  const router = useRouter();
  const {
    messages,
    stage,
    isStreaming,
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
  } = useCreatorStore();

  const handleSend = useCallback(
    async (text: string, files: File[]) => {
      addMessage({ role: "user", content: text });
      addMessage({ role: "assistant", content: "", isStreaming: true });
      setStreaming(true);

      try {
        const res = await fetch(`${API_BASE}/api/creator/outline`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            language,
            voiceId: voiceProfile.voiceId,
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

        // Parse outline bullets from streamed response (expecting newline-separated bullets)
        const bullets = fullText
          .split("\n")
          .map((l) => l.replace(/^[-•*]\s*/, "").trim())
          .filter(Boolean);
        setOutline(bullets);
      } catch (err) {
        addMessage({ role: "assistant", content: "Something went wrong. Please try again." });
        setStage("chat");
      } finally {
        setStreaming(false);
      }
    },
    [addMessage, appendStreamToken, language, setOutline, setStage, setStreaming, voiceProfile.voiceId]
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
    [addMessage, language, router, setStage, setStoryboard, setStreaming, voiceProfile.voiceId]
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <header className="px-6 py-4 border-b bg-white">
        <h1 className="font-semibold text-lg">Creator Mode</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <ChatHistory messages={messages} />

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

          <ChatInput
            isStreaming={isStreaming}
            language={language}
            uploadedFiles={uploadedFiles}
            onSend={handleSend}
            onLanguageChange={setLanguage}
            onAddFile={addFile}
            onRemoveFile={removeFile}
          />
        </div>
      </div>
    </div>
  );
}
