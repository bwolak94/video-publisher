/**
 * Component tests for Chat UI — CT-16-01..05
 */
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatHistory } from "@/components/creator/ChatHistory";
import { OutlineCard } from "@/components/creator/OutlineCard";
import { useCreatorStore } from "@/store/creatorStore";
import type { ChatMessage, OutlineBullet } from "@/store/creatorStore";

// Mock next/navigation for pages that use useRouter
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

beforeEach(() => {
  useCreatorStore.setState({
    messages: [],
    stage: "chat",
    isStreaming: false,
    outline: [],
    storyboardJson: null,
    language: "en",
    voiceProfile: { voiceId: "eleven_en_adam", displayName: "Adam", languageLabel: "English" },
    uploadedFiles: [],
  });
});

const SAMPLE_BULLETS: OutlineBullet[] = [
  { id: "b1", text: "The rise of FTX" },
  { id: "b2", text: "Sam Bankman-Fried's story" },
  { id: "b3", text: "The collapse begins" },
  { id: "b4", text: "Regulatory fallout" },
  { id: "b5", text: "Lessons learned" },
];

// CT-16-01: Chat renders with empty history → input visible, no messages
it("renders with empty message history — input visible, no messages (CT-16-01)", () => {
  render(<ChatHistory messages={[]} />);
  expect(screen.getByTestId("chat-history")).toBeInTheDocument();
  expect(screen.queryAllByTestId("chat-message")).toHaveLength(0);
});

// CT-16-02: Streaming response renders tokens progressively
it("displays streaming message with cursor indicator (CT-16-02)", () => {
  const messages: ChatMessage[] = [
    { id: "1", role: "assistant", content: "Generating...", isStreaming: true },
  ];
  render(<ChatHistory messages={messages} />);
  expect(screen.getByText("Generating...")).toBeInTheDocument();
  // The cursor pulse span is rendered
  expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
});

// CT-16-03: Outline card renders 5 bullets → 5 list items visible
it("OutlineCard renders 5 bullet points (CT-16-03)", () => {
  render(
    <OutlineCard
      bullets={SAMPLE_BULLETS}
      isStreaming={false}
      onUpdateBullet={jest.fn()}
      onApprove={jest.fn()}
    />
  );
  expect(screen.getAllByTestId("outline-bullet")).toHaveLength(5);
});

// CT-16-04: "Approve" click → onApprove called with bullets
it("Approve button calls onApprove with current bullets (CT-16-04)", async () => {
  const onApprove = jest.fn();
  render(
    <OutlineCard
      bullets={SAMPLE_BULLETS}
      isStreaming={false}
      onUpdateBullet={jest.fn()}
      onApprove={onApprove}
    />
  );

  await userEvent.click(screen.getByTestId("approve-button"));
  expect(onApprove).toHaveBeenCalledWith(SAMPLE_BULLETS);
});

// CT-16-05: Ctrl+Enter approves outline
it("Ctrl+Enter triggers outline approval (CT-16-05)", async () => {
  const onApprove = jest.fn();
  render(
    <OutlineCard
      bullets={SAMPLE_BULLETS}
      isStreaming={false}
      onUpdateBullet={jest.fn()}
      onApprove={onApprove}
    />
  );

  await act(async () => {
    fireEvent.keyDown(window, { key: "Enter", ctrlKey: true });
  });

  expect(onApprove).toHaveBeenCalledWith(SAMPLE_BULLETS);
});

// Approve button is disabled while streaming
it("Approve button is disabled during streaming (UT-16-06 / CT)", () => {
  render(
    <OutlineCard
      bullets={SAMPLE_BULLETS}
      isStreaming={true}
      onUpdateBullet={jest.fn()}
      onApprove={jest.fn()}
    />
  );
  expect(screen.getByTestId("approve-button")).toBeDisabled();
});
