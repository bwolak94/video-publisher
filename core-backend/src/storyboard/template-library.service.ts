import { Injectable, NotFoundException } from "@nestjs/common";
import * as crypto from "crypto";
import type { VideoStoryboard, StoryboardScene } from "./video-storyboard";

export type TemplateCategory = "educational" | "product" | "entertainment" | "news" | "listicle";

export interface TemplateScene {
  narrationPlaceholder: string;
  visualPromptPlaceholder: string;
  durationInSeconds: number;
  textOverlay?: { text: string; style: "standard" | "punchy" | "funny_sub" };
}

export interface StoryboardTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  aspectRatio: "16:9" | "9:16" | "1:1";
  sceneCount: number;
  estimatedDurationSeconds: number;
  scenes: TemplateScene[];
}

const TEMPLATES: StoryboardTemplate[] = [
  // ── Horizontal (16:9) ─────────────────────────────────────────────────────
  {
    id: "explainer-16-9",
    name: "Explainer Video",
    category: "educational",
    aspectRatio: "16:9",
    description: "Classic 5-scene explainer: problem → solution → how it works → benefits → CTA",
    sceneCount: 5,
    estimatedDurationSeconds: 60,
    scenes: [
      {
        narrationPlaceholder: "Have you ever struggled with [PROBLEM]? You're not alone.",
        visualPromptPlaceholder: "Person looking frustrated at a desk, cinematic lighting",
        durationInSeconds: 8,
        textOverlay: { text: "The Problem", style: "punchy" },
      },
      {
        narrationPlaceholder:
          "Introducing [PRODUCT/CONCEPT] — the solution that changes everything.",
        visualPromptPlaceholder:
          "Modern product reveal with dramatic lighting, close-up shot",
        durationInSeconds: 10,
        textOverlay: { text: "The Solution", style: "standard" },
      },
      {
        narrationPlaceholder:
          "Here's how it works: [EXPLAIN MECHANISM IN SIMPLE TERMS].",
        visualPromptPlaceholder:
          "Clean infographic-style animation, white background, flowing arrows",
        durationInSeconds: 15,
      },
      {
        narrationPlaceholder:
          "The benefits are clear: [BENEFIT 1], [BENEFIT 2], and [BENEFIT 3].",
        visualPromptPlaceholder:
          "Happy person using the product, natural daylight, warm tones",
        durationInSeconds: 12,
      },
      {
        narrationPlaceholder:
          "Ready to get started? Visit [URL] or click the link below.",
        visualPromptPlaceholder:
          "Bold call-to-action card on dark background, neon accent colours",
        durationInSeconds: 8,
        textOverlay: { text: "Get Started Today", style: "punchy" },
      },
    ],
  },
  {
    id: "product-demo-16-9",
    name: "Product Demo",
    category: "product",
    aspectRatio: "16:9",
    description: "6-scene product showcase with hook, features walkthrough, and social proof",
    sceneCount: 6,
    estimatedDurationSeconds: 90,
    scenes: [
      {
        narrationPlaceholder:
          "What if you could [ACHIEVE GOAL] in half the time? Watch this.",
        visualPromptPlaceholder:
          "Dramatic product on a sleek surface, studio lighting, bokeh background",
        durationInSeconds: 8,
        textOverlay: { text: "Wait for it...", style: "funny_sub" },
      },
      {
        narrationPlaceholder:
          "Meet [PRODUCT NAME]. Designed for [TARGET USER] who need [USE CASE].",
        visualPromptPlaceholder:
          "Product 360° rotation on white background, professional CGI render",
        durationInSeconds: 12,
      },
      {
        narrationPlaceholder: "Feature one: [FEATURE 1 — what it does and why it matters].",
        visualPromptPlaceholder:
          "Close-up of feature 1 in action, hands interacting with product",
        durationInSeconds: 15,
        textOverlay: { text: "Feature #1", style: "standard" },
      },
      {
        narrationPlaceholder: "Feature two: [FEATURE 2 — unique selling point].",
        visualPromptPlaceholder:
          "Side-by-side comparison showing before and after, split screen",
        durationInSeconds: 15,
        textOverlay: { text: "Feature #2", style: "standard" },
      },
      {
        narrationPlaceholder:
          '[CUSTOMER NAME] says: "[TESTIMONIAL QUOTE]".',
        visualPromptPlaceholder:
          "Happy customer in natural environment, candid documentary style",
        durationInSeconds: 15,
        textOverlay: { text: "★★★★★", style: "standard" },
      },
      {
        narrationPlaceholder:
          "Available now at [PRICE/PLACE]. Limited time: [OFFER].",
        visualPromptPlaceholder:
          "Product with offer overlay, urgency colours (red/gold), clean background",
        durationInSeconds: 10,
        textOverlay: { text: "Limited Time Offer", style: "punchy" },
      },
    ],
  },
  {
    id: "listicle-16-9",
    name: "Top 5 Listicle",
    category: "listicle",
    aspectRatio: "16:9",
    description: "Fast-paced numbered list — hook + 5 items + outro",
    sceneCount: 7,
    estimatedDurationSeconds: 70,
    scenes: [
      {
        narrationPlaceholder: "Here are the top 5 [TOPIC] you need to know about.",
        visualPromptPlaceholder: "Energetic intro shot, dynamic camera movement, vibrant colours",
        durationInSeconds: 5,
        textOverlay: { text: "Top 5 List", style: "punchy" },
      },
      {
        narrationPlaceholder: "Number 5: [ITEM 5 — brief explanation].",
        visualPromptPlaceholder: "Relevant B-roll for item 5, dynamic shot",
        durationInSeconds: 10,
        textOverlay: { text: "#5", style: "punchy" },
      },
      {
        narrationPlaceholder: "Number 4: [ITEM 4 — brief explanation].",
        visualPromptPlaceholder: "Relevant B-roll for item 4, different angle",
        durationInSeconds: 10,
        textOverlay: { text: "#4", style: "punchy" },
      },
      {
        narrationPlaceholder: "Number 3: [ITEM 3 — brief explanation].",
        visualPromptPlaceholder: "Relevant B-roll for item 3, aerial or wide shot",
        durationInSeconds: 10,
        textOverlay: { text: "#3", style: "punchy" },
      },
      {
        narrationPlaceholder: "Number 2: [ITEM 2 — brief explanation].",
        visualPromptPlaceholder: "Relevant B-roll for item 2, close-up details",
        durationInSeconds: 10,
        textOverlay: { text: "#2", style: "punchy" },
      },
      {
        narrationPlaceholder:
          "And number 1 — the most important: [ITEM 1 — full explanation].",
        visualPromptPlaceholder: "Hero shot for item 1, dramatic reveal, golden ratio framing",
        durationInSeconds: 15,
        textOverlay: { text: "#1 🏆", style: "punchy" },
      },
      {
        narrationPlaceholder:
          "If this was helpful, subscribe and drop your favourite in the comments.",
        visualPromptPlaceholder:
          "Upbeat outro screen with subscribe button, bright warm tones",
        durationInSeconds: 8,
      },
    ],
  },
  {
    id: "news-report-16-9",
    name: "News Report",
    category: "news",
    aspectRatio: "16:9",
    description: "Structured news segment: headline → context → expert view → what to watch",
    sceneCount: 4,
    estimatedDurationSeconds: 60,
    scenes: [
      {
        narrationPlaceholder: "Breaking: [HEADLINE — who, what, where, when].",
        visualPromptPlaceholder:
          "News studio set, broadcast aesthetic, lower-third graphic with title",
        durationInSeconds: 10,
        textOverlay: { text: "BREAKING", style: "standard" },
      },
      {
        narrationPlaceholder:
          "Background: [CONTEXT — why this matters and how it came to be].",
        visualPromptPlaceholder:
          "Archive-style footage, desaturated colour grade, documentary feel",
        durationInSeconds: 20,
      },
      {
        narrationPlaceholder:
          'Experts say: "[EXPERT QUOTE]". Analysts warn that [IMPLICATION].',
        visualPromptPlaceholder:
          "Interview-style talking head, professional office background, soft key light",
        durationInSeconds: 15,
        textOverlay: { text: "Expert Analysis", style: "standard" },
      },
      {
        narrationPlaceholder:
          "What to watch next: [UPCOMING EVENT/DEVELOPMENT]. We'll keep you updated.",
        visualPromptPlaceholder:
          "Forward-looking graphic — calendar, timeline, or map overlay",
        durationInSeconds: 10,
        textOverlay: { text: "What's Next", style: "standard" },
      },
    ],
  },
  // ── Vertical (9:16 — TikTok / Shorts / Reels) ────────────────────────────
  {
    id: "hook-story-cta-9-16",
    name: "Hook → Story → CTA (Shorts)",
    category: "entertainment",
    aspectRatio: "9:16",
    description: "3-scene vertical short: attention hook + personal story + call-to-action",
    sceneCount: 3,
    estimatedDurationSeconds: 45,
    scenes: [
      {
        narrationPlaceholder:
          "Stop scrolling — [BOLD HOOK STATEMENT that creates curiosity or controversy].",
        visualPromptPlaceholder:
          "Eye-catching vertical close-up, bright colours, person reacting dramatically",
        durationInSeconds: 8,
        textOverlay: { text: "Wait for it 👀", style: "funny_sub" },
      },
      {
        narrationPlaceholder:
          "Here's the truth: [STORY or INSIGHT that pays off the hook].",
        visualPromptPlaceholder:
          "Vertical B-roll montage, fast cuts, trending aesthetic",
        durationInSeconds: 25,
      },
      {
        narrationPlaceholder: "Follow for more. Drop a 🔥 if you agree.",
        visualPromptPlaceholder:
          "Vertical outro with creator branding, bold colours, follow animation",
        durationInSeconds: 5,
        textOverlay: { text: "Follow for More 🔥", style: "punchy" },
      },
    ],
  },
  {
    id: "tutorial-9-16",
    name: "Quick Tutorial (Shorts)",
    category: "educational",
    aspectRatio: "9:16",
    description: "4-scene how-to short: promise + steps + result + follow",
    sceneCount: 4,
    estimatedDurationSeconds: 55,
    scenes: [
      {
        narrationPlaceholder: "Learn [SKILL] in under 60 seconds.",
        visualPromptPlaceholder:
          "Vertical title card, bold text on gradient background",
        durationInSeconds: 5,
        textOverlay: { text: "In 60 Seconds ⚡", style: "punchy" },
      },
      {
        narrationPlaceholder: "Step 1: [ACTION]. Step 2: [ACTION]. Step 3: [ACTION].",
        visualPromptPlaceholder:
          "Screen recording or hands-on demo, vertical crop, numbered overlays",
        durationInSeconds: 30,
      },
      {
        narrationPlaceholder: "And just like that — [RESULT]. Took me [TIME].",
        visualPromptPlaceholder:
          "Before/after reveal, satisfying transition, vertical format",
        durationInSeconds: 12,
        textOverlay: { text: "Done! ✅", style: "standard" },
      },
      {
        narrationPlaceholder: "Save this for later and follow for daily tips.",
        visualPromptPlaceholder:
          "Animated save/follow prompt on vertical background",
        durationInSeconds: 5,
      },
    ],
  },
  // ── Square (1:1 — Instagram Feed) ─────────────────────────────────────────
  {
    id: "brand-story-1-1",
    name: "Brand Story (Square)",
    category: "product",
    aspectRatio: "1:1",
    description: "4-scene square video for Instagram feed: origin + mission + product + CTA",
    sceneCount: 4,
    estimatedDurationSeconds: 45,
    scenes: [
      {
        narrationPlaceholder:
          "It started with a simple question: [FOUNDING STORY HOOK].",
        visualPromptPlaceholder:
          "Square format origin scene, warm nostalgia tones, film grain",
        durationInSeconds: 10,
      },
      {
        narrationPlaceholder:
          "Our mission: [MISSION STATEMENT — what you stand for and who you serve].",
        visualPromptPlaceholder:
          "Square brand visual, logo reveal, minimalist design",
        durationInSeconds: 10,
        textOverlay: { text: "Our Mission", style: "standard" },
      },
      {
        narrationPlaceholder:
          "That's why we built [PRODUCT] — [ONE-LINE VALUE PROP].",
        visualPromptPlaceholder:
          "Square product shot, lifestyle context, brand colour palette",
        durationInSeconds: 15,
      },
      {
        narrationPlaceholder: "Shop now — link in bio.",
        visualPromptPlaceholder:
          "Square CTA card, brand colours, clean typography",
        durationInSeconds: 8,
        textOverlay: { text: "Link in Bio ↑", style: "punchy" },
      },
    ],
  },
];

@Injectable()
export class TemplateLibraryService {
  listAll(): StoryboardTemplate[] {
    return TEMPLATES;
  }

  findById(id: string): StoryboardTemplate {
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) throw new NotFoundException(`Template "${id}" not found`);
    return tpl;
  }

  /**
   * Materialise a template into a VideoStoryboard with placeholder texts.
   * The caller is expected to fill in the [BRACKETED] placeholders before
   * sending the storyboard for asset generation.
   */
  toStoryboard(templateId: string, voiceId: string): VideoStoryboard {
    const tpl = this.findById(templateId);

    const timeline: StoryboardScene[] = tpl.scenes.map((s, i) => ({
      sceneId: crypto.randomUUID(),
      sequenceNumber: i + 1,
      durationInSeconds: s.durationInSeconds,
      narrationText: s.narrationPlaceholder,
      visualPrompt: s.visualPromptPlaceholder,
      textOverlay: s.textOverlay,
    }));

    return {
      meta: {
        title: tpl.name,
        description: tpl.description,
        tags: [tpl.category],
        aspectRatio: tpl.aspectRatio,
        language: "en",
        voiceId,
      },
      timeline,
    };
  }
}
