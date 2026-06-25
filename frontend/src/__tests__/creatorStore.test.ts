/**
 * Unit tests for creatorStore — UT-16-04..06
 */
import { useCreatorStore } from "@/store/creatorStore";

// Reset Zustand store between tests
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

describe("creatorStore", () => {
  // UT-16-04: language selector "PL" → state language = "pl", voice shows Polish name
  it("setLanguage('pl') updates language and voiceProfile (UT-16-04)", () => {
    useCreatorStore.getState().setLanguage("pl");
    const { language, voiceProfile } = useCreatorStore.getState();
    expect(language).toBe("pl");
    expect(voiceProfile.displayName).toBe("Marek");
    expect(voiceProfile.languageLabel).toBe("Polish");
  });

  // UT-16-05: outline edit — user modifies bullet → Zustand state updated
  it("updateOutlineBullet updates the correct bullet text (UT-16-05)", () => {
    useCreatorStore.getState().setOutline(["Bullet 1", "Bullet 2", "Bullet 3"]);
    const { outline } = useCreatorStore.getState();
    const bulletId = outline[2].id;

    useCreatorStore.getState().updateOutlineBullet(bulletId, "Updated Bullet 3");

    const updated = useCreatorStore.getState().outline;
    expect(updated[2].text).toBe("Updated Bullet 3");
    expect(updated[0].text).toBe("Bullet 1"); // others unchanged
  });

  // UT-16-06: approve button disabled during streaming
  it("isStreaming is true while streaming and false otherwise (UT-16-06)", () => {
    expect(useCreatorStore.getState().isStreaming).toBe(false);
    useCreatorStore.getState().setStreaming(true);
    expect(useCreatorStore.getState().isStreaming).toBe(true);
    useCreatorStore.getState().setStreaming(false);
    expect(useCreatorStore.getState().isStreaming).toBe(false);
  });

  it("setOutline sets stage to 'outline' and creates bullets with ids", () => {
    useCreatorStore.getState().setOutline(["A", "B", "C"]);
    const { stage, outline } = useCreatorStore.getState();
    expect(stage).toBe("outline");
    expect(outline).toHaveLength(3);
    expect(outline[0]).toHaveProperty("id");
    expect(outline[0].text).toBe("A");
  });

  it("addMessage appends to messages array", () => {
    useCreatorStore.getState().addMessage({ role: "user", content: "Hello" });
    expect(useCreatorStore.getState().messages).toHaveLength(1);
    expect(useCreatorStore.getState().messages[0].content).toBe("Hello");
  });

  it("appendStreamToken appends to last streaming message", () => {
    useCreatorStore.getState().addMessage({ role: "assistant", content: "He", isStreaming: true });
    useCreatorStore.getState().appendStreamToken("llo");
    const msgs = useCreatorStore.getState().messages;
    expect(msgs[0].content).toBe("Hello");
  });
});
