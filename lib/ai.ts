import { getConfig } from "./config";
import type { ApiResult, ToolKind } from "./api";

type GenerateRequest = {
  kind: ToolKind;
  input: string;
  payload: Record<string, unknown>;
  requestId: string;
};

type GenerateResponse = {
  result: ApiResult;
  status: number;
};

type OpenAiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

export async function generateResult({ kind, input, payload, requestId }: GenerateRequest): Promise<GenerateResponse> {
  const config = getConfig();

  if (config.ai.provider === "mock" || !config.ai.openaiApiKey) {
    return {
      status: 200,
      result: mockResult(kind, input, payload, requestId),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.ai.openaiApiKey}`,
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        model: config.ai.openaiModel,
        input: buildPrompt(kind, input, payload),
      }),
      signal: controller.signal,
    });

    const raw = (await response.json().catch(() => ({}))) as OpenAiResponse;
    const text = normalizeOpenAiText(raw);

    if (!response.ok) {
      return {
        status: 502,
        result: {
          ok: false,
          result: raw.error?.message || `AI provider returned HTTP ${response.status}.`,
          raw: { requestId, provider: config.ai.provider, status: response.status },
        },
      };
    }

    return {
      status: 200,
      result: {
        ok: true,
        result: text || "The AI provider returned an empty response.",
        raw: { requestId, provider: config.ai.provider, model: config.ai.openaiModel },
      },
    };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "AI request timed out. Please try again."
      : error instanceof Error && error.message
        ? `AI request failed: ${error.message}`
        : "AI request failed.";

    return {
      status: 502,
      result: {
        ok: false,
        result: message,
        raw: { requestId, provider: config.ai.provider },
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(kind: ToolKind, input: string, payload: Record<string, unknown>): string {
  if (kind === "assignment") {
    return `You are AssignAI, an academic drafting assistant. Help the user structure and draft their own assignment. Do not invent citations. Ask for missing sources when needed.

Assignment details:
- Level: ${stringValue(payload.level, "College")}
- Word count: ${stringValue(payload.wordCount, "1000")}
- Tone: ${stringValue(payload.tone, "Academic")}
- Subject: ${stringValue(payload.subject, "General")}

User request:
${input}

Return a polished assignment draft with: title, thesis, introduction, body sections with headings, conclusion, and citation reminders.`;
  }

  if (kind === "humanize") {
    return `Rewrite the following text so it sounds natural, clear, and human while preserving the meaning. Keep it suitable for academic or professional use. Do not add new claims.

Tone: ${stringValue(payload.tone, "Natural")}

Text:
${input}`;
  }

  return `Create a PowerPoint-ready deck outline for the user's academic presentation.

Topic or request:
${input}

Audience: ${stringValue(payload.audience, "Academic audience")}
Slide count: ${stringValue(payload.slideCount, "6")}
Style: ${stringValue(payload.style, "Academic briefing")}

Return numbered slides. For each slide include: slide title, 3 concise bullets, suggested visual, and speaker notes.`;
}

function normalizeOpenAiText(raw: OpenAiResponse): string {
  if (typeof raw.output_text === "string" && raw.output_text.trim()) return raw.output_text.trim();

  const chunks = raw.output
    ?.flatMap((item) => item.content || [])
    .map((content) => content.text)
    .filter((text): text is string => Boolean(text?.trim()));

  return chunks?.join("\n").trim() || "";
}

function mockResult(kind: ToolKind, input: string, payload: Record<string, unknown>, requestId: string): ApiResult {
  if (kind === "assignment") {
    return {
      ok: true,
      result: `Mock assignment draft\n\nTitle: ${shortTitle(input)}\n\nThesis\nThis assignment will argue a clear position on the topic, using evidence from your own sources and linking each section back to the brief.\n\nIntroduction\nIntroduce the topic, define the key terms, and explain why the question matters. End with a direct thesis statement.\n\nBody section 1\nDevelop the first major point. Add a cited source, explain what it shows, and connect the evidence to the thesis.\n\nBody section 2\nDevelop a second point or counterargument. Show how the evidence complicates, supports, or limits the main argument.\n\nConclusion\nReturn to the thesis, synthesize the strongest evidence, and close with the broader implication.\n\nCitation reminder\nReplace this mock output with real AI generation by adding OPENAI_API_KEY. Do not submit without checking sources and citations.`,
      raw: { mock: true, kind, requestId },
    };
  }

  if (kind === "humanize") {
    return {
      ok: true,
      result: `${input}\n\nMock note: this is the fallback response. Add OPENAI_API_KEY to enable a full humanized rewrite while keeping the original meaning intact.`,
      raw: { mock: true, kind, requestId },
    };
  }

  return {
    ok: true,
    result: `Mock PowerPoint outline\n\nSlide 1: ${shortTitle(input)}\n- Introduce the topic\n- State the central argument\n- Preview the structure\nSuggested visual: Clean title slide\nSpeaker notes: Open by explaining why this topic matters.\n\nSlide 2: Context\n- Define key terms\n- Summarize background\n- Identify the debate\nSuggested visual: Timeline or concept map\nSpeaker notes: Give the audience enough context to follow the argument.\n\nSlide 3: Main Evidence\n- Present one core source\n- Explain the finding\n- Link it to your argument\nSuggested visual: Quote, chart, or source card\nSpeaker notes: Focus on analysis rather than reading the slide.\n\nSlide 4: Conclusion\n- Return to the thesis\n- Name the strongest takeaway\n- End with an implication\nSuggested visual: Final summary statement\nSpeaker notes: Close clearly and avoid introducing new material.`,
    raw: { mock: true, kind, requestId },
  };
}

function stringValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function shortTitle(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 72) || "Untitled";
}
