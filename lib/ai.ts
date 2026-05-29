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

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

export async function generateResult({ kind, input, payload, requestId }: GenerateRequest): Promise<GenerateResponse> {
  const config = getConfig();

  if (config.ai.provider === "mock" || !config.ai.openRouterApiKey) {
    return {
      status: 200,
      result: mockResult(kind, input, payload, requestId),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${config.ai.openRouterApiKey}`,
      "x-request-id": requestId,
      "x-title": config.ai.appTitle,
    };

    if (config.ai.appUrl) {
      headers["http-referer"] = config.ai.appUrl;
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.ai.openRouterModel,
        messages: [
          {
            role: "system",
            content: systemPromptFor(kind),
          },
          {
            role: "user",
            content: buildUserPrompt(kind, input, payload),
          },
        ],
        temperature: kind === "humanize" ? 0.5 : 0.3,
      }),
      signal: controller.signal,
    });

    const raw = (await response.json().catch(() => ({}))) as OpenRouterResponse;
    const text = normalizeOpenRouterText(raw);

    if (!response.ok) {
      return {
        status: 502,
        result: {
          ok: false,
          result: raw.error?.message || `OpenRouter returned HTTP ${response.status}.`,
          raw: { requestId, provider: config.ai.provider, status: response.status },
        },
      };
    }

    return {
      status: 200,
      result: {
        ok: true,
        result: text || "OpenRouter returned an empty response.",
        raw: { requestId, provider: config.ai.provider, model: config.ai.openRouterModel },
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

function systemPromptFor(kind: ToolKind): string {
  if (kind === "assignment") {
    return `You are AssignAI's Assignment Writer, an academic writing assistant for planning, drafting, and improving a student's own work.

Rules:
- Do not invent sources, quotes, statistics, page numbers, or references.
- If sources are missing, use citation placeholders like [Add source: author/year] and explain what evidence is needed.
- Keep the user's requested level, subject, tone, and word target in mind.
- Produce useful work, but make it reviewable and editable rather than pretending it is submission-ready.
- Avoid academic misconduct language. Frame the result as a draft, plan, or study aid.
- Make the structure clear enough that a student can revise it against their rubric.`;
  }

  if (kind === "humanize") {
    return "You are AssignAI's humanizer. Rewrite text to sound natural and clear while preserving the user's meaning. Do not add unsupported claims or change the factual content.";
  }

  return "You are AssignAI's presentation assistant. Create PowerPoint-ready academic deck outlines with slide titles, concise bullets, suggested visuals, and speaker notes.";
}

function buildUserPrompt(kind: ToolKind, input: string, payload: Record<string, unknown>): string {
  if (kind === "assignment") {
    return `Create an assignment-writing output using the details below.

Assignment settings:
- Level: ${stringValue(payload.level, "College")}
- Word target: ${stringValue(payload.wordCount, "1000")}
- Tone: ${stringValue(payload.tone, "Academic")}
- Subject: ${stringValue(payload.subject, "General")}
- Citation style: ${stringValue(payload.citationStyle, "Not specified")}
- Draft type: ${stringValue(payload.draftType, "Full structured draft")}

Assignment brief / user request:
${input}

Rubric or marking notes:
${stringValue(payload.rubric, "No rubric provided.")}

User sources / evidence notes:
${stringValue(payload.sources, "No sources provided. Use placeholders instead of inventing citations.")}

Return the result in this exact structure:

# Assignment Brief Analysis
- Restate the task in plain English.
- Identify what the marker is likely looking for.
- List any missing information or source gaps.

# Working Thesis
Write one clear thesis statement. If the prompt is descriptive rather than argumentative, write a controlling focus instead.

# Essay Plan
Create 4-7 sections. For each section include:
- Purpose
- Key point
- Evidence needed
- Link back to the question

# Draft
Write a polished draft at the requested level and tone. Use headings. Use citation placeholders where evidence is needed. Do not create a bibliography unless real source details were provided.

# Revision Checklist
Include 6-8 concrete checks the student should complete before submission, including citations, rubric alignment, factual checking, and personal editing.`;
  }

  if (kind === "humanize") {
    return `Tone: ${stringValue(payload.tone, "Natural")}

Text:
${input}`;
  }

  return `Topic or request:
${input}

Audience: ${stringValue(payload.audience, "Academic audience")}
Slide count: ${stringValue(payload.slideCount, "6")}
Style: ${stringValue(payload.style, "Academic briefing")}

Return numbered slides. For each slide include: slide title, 3 concise bullets, suggested visual, and speaker notes.`;
}

function normalizeOpenRouterText(raw: OpenRouterResponse): string {
  return raw.choices?.[0]?.message?.content?.trim() || "";
}

function mockResult(kind: ToolKind, input: string, payload: Record<string, unknown>, requestId: string): ApiResult {
  if (kind === "assignment") {
    return {
      ok: true,
      result: `# Assignment Brief Analysis
- Task: ${shortTitle(input)}
- Level: ${stringValue(payload.level, "College")}
- Marker focus: clear argument, relevant evidence, structure, and accurate citations.
- Missing information: add your rubric and real source notes for a stronger draft.

# Working Thesis
This assignment will argue a clear position on the topic by using evidence from your own sources and linking each section back to the brief.

# Essay Plan

## 1. Introduction
- Purpose: define the topic and narrow toward the question.
- Key point: explain why the issue matters.
- Evidence needed: background source or course reading.
- Link back: end with the thesis.

## 2. First Main Argument
- Purpose: develop the strongest supporting point.
- Key point: connect the first claim to the thesis.
- Evidence needed: [Add source: author/year].
- Link back: explain how this answers the question.

## 3. Counterpoint or Complication
- Purpose: show critical thinking.
- Key point: acknowledge a limitation, debate, or alternative view.
- Evidence needed: [Add source: author/year].
- Link back: show whether this changes the main argument.

## 4. Conclusion
- Purpose: synthesize, not repeat.
- Key point: restate the insight in fresh wording.
- Evidence needed: no new evidence.
- Link back: close on the broader implication.

# Draft

## Introduction
Introduce the topic, define the key terms, and explain why the assignment question matters. The final sentence should present your working thesis clearly.

## First Main Argument
Develop your first major point here. Add a properly cited source, explain what it shows, and connect the evidence to the thesis. Avoid dropping in evidence without analysis.

## Counterpoint or Complication
A stronger assignment usually shows awareness of complexity. Present a credible counterpoint, limitation, or alternative interpretation. Then explain how this affects your argument.

## Conclusion
Return to the thesis, synthesize the strongest evidence, and close with the broader implication of the argument.

# Revision Checklist
- Add real citations where placeholders appear.
- Check the draft against every rubric point.
- Verify facts, names, dates, and definitions.
- Make sure each paragraph links back to the question.
- Remove unsupported claims.
- Edit the wording so it reflects your own understanding.
- Format the reference list in the required citation style.
- Confirm the final word count before submission.`,
      raw: { mock: true, kind, requestId },
    };
  }

  if (kind === "humanize") {
    return {
      ok: true,
      result: `${input}\n\nMock note: this is the fallback response. Add OPENROUTER_API_KEY to enable a full humanized rewrite while keeping the original meaning intact.`,
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
