/**
 * TASK-22 — Zustand Store Architecture tests
 *
 * UT-22-01..06 are covered by timelineStore.test.ts.
 * This file adds UT-22-07, UT-22-08, and useProjectStore tests.
 */
import { useCreatorStore, useChatStore } from "@/store/creatorStore";
import { useProjectStore } from "@/store/projectStore";

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

  useProjectStore.setState({
    projectId: null,
    title: "",
    mode: "creator",
    pipelineStatus: "idle",
  });
});

// UT-22-07: addMessage appends to messages array
it("addMessage appends to messages array and increments length (UT-22-07)", () => {
  const store = useCreatorStore.getState();
  store.addMessage({ role: "user", content: "Hello" });
  store.addMessage({ role: "assistant", content: "Hi there" });

  const { messages } = useCreatorStore.getState();
  expect(messages).toHaveLength(2);
  expect(messages[0].content).toBe("Hello");
  expect(messages[1].content).toBe("Hi there");
  expect(messages[0]).toHaveProperty("id");
  expect(messages[0]).toHaveProperty("role", "user");
});

// UT-22-08: updateOutlineBullet(index=2, "new text") → outline[2] updated
it("updateOutlineBullet updates the bullet at index 2 (UT-22-08)", () => {
  useCreatorStore.getState().setOutline(["Bullet 1", "Bullet 2", "Bullet 3"]);
  const bulletAtIndex2 = useCreatorStore.getState().outline[2];

  useCreatorStore.getState().updateOutlineBullet(bulletAtIndex2.id, "new text");

  const updated = useCreatorStore.getState().outline;
  expect(updated[2].text).toBe("new text");
  expect(updated[0].text).toBe("Bullet 1"); // others unchanged
  expect(updated[1].text).toBe("Bullet 2");
});

// useChatStore is an alias for useCreatorStore (TASK-22 spec compliance)
it("useChatStore is the same store instance as useCreatorStore", () => {
  useChatStore.getState().addMessage({ role: "user", content: "from chat store" });
  expect(useCreatorStore.getState().messages[0].content).toBe("from chat store");
});

// useProjectStore: setProject sets all project fields
it("setProject updates projectId, title, and mode", () => {
  useProjectStore.getState().setProject({ id: "proj-xyz", title: "My Video", mode: "creator" });

  const { projectId, title, mode } = useProjectStore.getState();
  expect(projectId).toBe("proj-xyz");
  expect(title).toBe("My Video");
  expect(mode).toBe("creator");
});

// useProjectStore: setPipelineStatus updates status
it("setPipelineStatus transitions through pipeline statuses", () => {
  useProjectStore.getState().setPipelineStatus("running");
  expect(useProjectStore.getState().pipelineStatus).toBe("running");

  useProjectStore.getState().setPipelineStatus("completed");
  expect(useProjectStore.getState().pipelineStatus).toBe("completed");
});
