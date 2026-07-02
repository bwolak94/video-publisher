/**
 * Component tests for ReferenceVideoInput — CT-06-01..06
 *
 * Tests cover: URL input, analyze flow, brief summary display,
 * expanded detail view, error state, and clear action.
 */
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReferenceVideoInput } from "@/components/creator/ReferenceVideoInput";
import type { ReferenceAnalysisBrief } from "@/types/reference-analysis";

const MOCK_BRIEF: ReferenceAnalysisBrief = {
  sourceUrl: "https://youtube.com/watch?v=abc123",
  totalDurationSeconds: 180,
  sceneCount: 15,
  avgSceneDurationSeconds: 12.0,
  pacing: "fast",
  toneProfile: "educational",
  structurePattern: "hook → problem → solution → cta",
  transcript: "This is a test transcript about AI and machine learning.",
  keyTopics: ["AI", "machine learning", "productivity"],
  visualStyle: "talking head with b-roll cutaways",
  audioAnalysis: { hasMusic: true, hasSpeech: true, avgLoudnessLUFS: -18.0 },
  analyzedAt: "2026-07-02T10:00:00Z",
};

// Reset fetch mock between tests
beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.restoreAllMocks();
});

// CT-06-01: Renders URL input and Analyze button
it("renders URL input and Analyze button (CT-06-01)", () => {
  render(
    <ReferenceVideoInput apiBase="http://localhost:3002" onAnalyzed={jest.fn()} />
  );

  expect(screen.getByPlaceholderText(/YouTube URL or direct video link/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /analyze/i })).toBeInTheDocument();
});

// CT-06-02: Analyze button disabled when URL is empty
it("Analyze button is disabled when URL is empty (CT-06-02)", () => {
  render(
    <ReferenceVideoInput apiBase="http://localhost:3002" onAnalyzed={jest.fn()} />
  );

  const button = screen.getByRole("button", { name: /analyze/i });
  expect(button).toBeDisabled();
});

// CT-06-03: Successful analysis calls onAnalyzed and shows summary badges
it("shows brief summary after successful analysis (CT-06-03)", async () => {
  const onAnalyzed = jest.fn();
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => MOCK_BRIEF,
  });

  render(
    <ReferenceVideoInput apiBase="http://localhost:3002" onAnalyzed={onAnalyzed} />
  );

  const input = screen.getByPlaceholderText(/YouTube URL/i);
  await userEvent.type(input, "https://youtube.com/watch?v=abc123");

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
  });

  await waitFor(() => {
    expect(screen.getByText(/fast pace/i)).toBeInTheDocument();
    expect(screen.getByText(/educational/i)).toBeInTheDocument();
    expect(screen.getByText(/180s/)).toBeInTheDocument();
    expect(screen.getByText(/15 scenes/)).toBeInTheDocument();
  });

  expect(onAnalyzed).toHaveBeenCalledWith(
    "https://youtube.com/watch?v=abc123",
    MOCK_BRIEF
  );
});

// CT-06-04: Error state shown on API failure
it("shows error message on API failure (CT-06-04)", async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    text: async () => "Video too large: 600 MB (limit 500 MB)",
  });

  render(
    <ReferenceVideoInput apiBase="http://localhost:3002" onAnalyzed={jest.fn()} />
  );

  const input = screen.getByPlaceholderText(/YouTube URL/i);
  await userEvent.type(input, "https://youtube.com/watch?v=toolarge");

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
  });

  await waitFor(() => {
    expect(screen.getByText(/Video too large/i)).toBeInTheDocument();
  });
});

// CT-06-05: Clear button removes brief and resets input
it("clear button removes the brief and resets (CT-06-05)", async () => {
  const onAnalyzed = jest.fn();
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => MOCK_BRIEF,
  });

  render(
    <ReferenceVideoInput apiBase="http://localhost:3002" onAnalyzed={onAnalyzed} />
  );

  await userEvent.type(
    screen.getByPlaceholderText(/YouTube URL/i),
    "https://youtube.com/watch?v=abc123"
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
  });

  await waitFor(() => expect(screen.getByText(/fast pace/i)).toBeInTheDocument());

  // Click the ✕ clear button
  const clearButton = screen.getByTitle(/remove reference video/i);
  await act(async () => {
    fireEvent.click(clearButton);
  });

  // URL input should be visible again
  expect(screen.getByPlaceholderText(/YouTube URL/i)).toBeInTheDocument();
  expect(onAnalyzed).toHaveBeenLastCalledWith("", null);
});

// CT-06-06: "Show analysis" toggle reveals structure/style/topics/transcript
it("expanded view shows structure pattern and key topics (CT-06-06)", async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => MOCK_BRIEF,
  });

  render(
    <ReferenceVideoInput apiBase="http://localhost:3002" onAnalyzed={jest.fn()} />
  );

  await userEvent.type(
    screen.getByPlaceholderText(/YouTube URL/i),
    "https://youtube.com/watch?v=abc123"
  );
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /analyze/i }));
  });

  await waitFor(() => expect(screen.getByText(/show analysis/i)).toBeInTheDocument());

  // Toggle expanded view
  fireEvent.click(screen.getByText(/show analysis/i));

  expect(screen.getByText(/hook → problem → solution → cta/i)).toBeInTheDocument();
  expect(screen.getByText(/talking head with b-roll cutaways/i)).toBeInTheDocument();
  expect(screen.getByText("AI")).toBeInTheDocument();
  expect(screen.getByText("machine learning")).toBeInTheDocument();
  expect(screen.getByText(/This is a test transcript/i)).toBeInTheDocument();
});

// CT-06-07: Enter key triggers analyze
it("pressing Enter in URL input triggers analyze (CT-06-07)", async () => {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => MOCK_BRIEF,
  });

  render(
    <ReferenceVideoInput apiBase="http://localhost:3002" onAnalyzed={jest.fn()} />
  );

  const input = screen.getByPlaceholderText(/YouTube URL/i);
  await userEvent.type(input, "https://youtube.com/watch?v=abc123");

  await act(async () => {
    fireEvent.keyDown(input, { key: "Enter" });
  });

  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
});
