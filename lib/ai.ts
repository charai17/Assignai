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

const HUMANIZER_POLICY = `Natural writing policy adapted from blader/humanizer v2.7.0 (MIT). Use it as editing guidance for clarity, voice, and readability, not as a promise to bypass detectors.

Core rules:
- Preserve the user's meaning, structure, and factual claims.
- Do not add unsupported claims, fake citations, fake quotes, fake statistics, page numbers, DOI values, URLs, or references.
- Match the requested tone and academic level. For academic work, stay clear, precise, and appropriately formal.
- Prefer specific, plain language over inflated significance language such as pivotal, crucial, vital, vibrant, groundbreaking, testament, tapestry, landscape, or showcases.
- Replace vague attributions such as experts argue, observers suggest, or industry reports with specific cited evidence. If evidence is missing, use a source placeholder.
- Avoid filler phrases such as in order to, due to the fact that, it is important to note that, at this point in time, and has the ability to.
- Avoid formulaic constructions: not only X but Y, it is not just X, rule-of-three lists, false from X to Y ranges, and generic upbeat conclusions.
- Prefer is, are, and has when they are clearer than serves as, stands as, boasts, features, marks, or represents.
- Remove chatbot artifacts such as great question, certainly, here is, I hope this helps, let me know, and would you like.
- Use varied sentence length and natural paragraph rhythm. Do not make every paragraph the same shape.
- Keep headings useful and direct. Avoid title case unless the requested format requires it.
- Avoid emojis, excessive bold formatting, and decorative punctuation.
- Do not use em dashes or en dashes in final generated prose. Use commas, periods, colons, or parentheses instead.
- Keep citation placeholders intact so the user can verify sources before submission.`;

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
    return `You are AssignAI's Assignment Writer. Your job is to run a staged academic writing workflow from the user's brief.

Workflow:
1. Analyze the brief and optional rubric/extra information.
2. Infer the assignment topic, likely task type, expected citation style, target word count, academic level, and marking priorities.
3. Break the assignment into logical sections with word-count allocations that add up to the target.
4. Write the assignment section by section in the planned order.
5. Apply the natural writing policy to every generated section.
6. Humanize the final draft so it reads naturally while staying academic, clear, and suitable for the requested level.
7. Return the humanized draft and a final checklist.

Rules:
- Do not invent sources, quotes, statistics, page numbers, DOI values, URLs, or references.
- If sources are missing, use citation placeholders like [Add source: author/year] and explain what evidence is needed.
- If the brief does not state citation style, infer a likely style only when there is evidence; otherwise say "not specified" and use neutral placeholders.
- If the brief does not state word count, use the user's selected word target.
- Do not expose hidden chain-of-thought. Give concise visible analysis and decisions.
- Frame the result as an editable draft/study aid, not a guaranteed submission-ready essay.
- Keep headings clear so the user can revise against the rubric.

${HUMANIZER_POLICY}`;
  }

  if (kind === "humanize") {
    return `You are AssignAI's Humanizer. The user will paste text. Return only the humanized version of that text.

Rules:
- Preserve the original meaning, factual claims, citations, links, names, numbers, and order of ideas.
- Do not add commentary, headings, explanations, scores, notes, or before/after labels.
- Do not invent sources, citations, quotations, facts, or examples.
- Keep the requested tone, but do not make academic text casual unless the user asked for that.
- If the input contains citations or placeholders, keep them intact.
- If a sentence is already natural, leave it mostly alone.
- Return plain text only.

${HUMANIZER_POLICY}`;
  }

  return `You are AssignAI's presentation assistant. Create PowerPoint-ready academic deck outlines with slide titles, concise bullets, suggested visuals, and speaker notes. Apply the natural writing policy so slide text is clear, specific, and not padded.

${HUMANIZER_POLICY}`;
}

function buildUserPrompt(kind: ToolKind, input: string, payload: Record<string, unknown>): string {
  if (kind === "assignment") {
    return `Run the full Assignment Writer workflow using the inputs below.

User prompt / assignment brief:
${input}

Optional rubric:
${stringValue(payload.rubric, "No rubric provided.")}

Optional extra information, sources, evidence notes, or tutor instructions:
${stringValue(payload.sources, "No extra information provided. Use placeholders instead of inventing citations.")}

User-selected settings:
- Selected word target: ${stringValue(payload.wordCount, "1000")}
- Selected citation style: ${stringValue(payload.citationStyle, "Not specified")}
- Selected academic level: ${stringValue(payload.level, "College")}
- Selected subject: ${stringValue(payload.subject, "General")}
- Selected tone: ${stringValue(payload.tone, "Academic")}
- Selected draft type: ${stringValue(payload.draftType, "Full structured draft")}

Return the result in this exact structure:

# Brief Analysis
- What the assignment is about
- What type of task it is, such as essay, report, reflection, discussion, case study, or literature review
- Inferred or selected word count
- Inferred or selected citation style
- Academic level and subject
- What the marker is likely looking for
- Any missing information that affects quality

# Section Plan With Word Counts
Create a section-by-section plan. Include the target word count for each section and make the total equal the assignment word count. Include what each section must do and what evidence is needed.

# Writing Plan
List the order in which sections will be written and the purpose of each section.

# Section-by-Section Draft
Write each section one by one using headings. Respect the section word-count plan as closely as possible. Use citation placeholders when real source details are missing. If the user provided sources or evidence notes, use only those source details and do not invent bibliographic information.

# Humanized Final Draft
Rewrite the section-by-section draft into a smoother final version using the natural writing policy. Keep the same argument and evidence. Make the writing sound natural, varied, and human while remaining academic. Keep citation placeholders intact.

# Final Checks Before Submission
Include practical checks for rubric alignment, citations, word count, factual accuracy, source verification, formatting, and personal editing.`;
  }

  if (kind === "humanize") {
    return `Humanize the text below.

Tone: ${stringValue(payload.tone, "Natural")}

Return only the rewritten text. Do not include labels, explanations, notes, summaries, or markdown fences.

Text:
${input}`;
  }

  return `Topic or request:
${input}

Audience: ${stringValue(payload.audience, "Academic audience")}
Slide count: ${stringValue(payload.slideCount, "6")}
Style: ${stringValue(payload.style, "Academic briefing")}

Return numbered slides. For each slide include: slide title, 3 concise bullets, suggested visual, and speaker notes. Apply the natural writing policy to slide text and notes.`;
}

function normalizeOpenRouterText(raw: OpenRouterResponse): string {
  return raw.choices?.[0]?.message?.content?.trim() || "";
}

function mockResult(kind: ToolKind, input: string, payload: Record<string, unknown>, requestId: string): ApiResult {
  if (kind === "assignment") {
    const target = stringValue(payload.wordCount, "1000");
    const citation = stringValue(payload.citationStyle, "Not specified");

    return {
      ok: true,
      result: `# Brief Analysis
- What the assignment is about: ${shortTitle(input)}
- Task type: essay or structured academic response, based on the current brief.
- Inferred or selected word count: ${target} words.
- Inferred or selected citation style: ${citation}.
- Academic level and subject: ${stringValue(payload.level, "College")} / ${stringValue(payload.subject, "General")}.
- Marker focus: answer the question directly, use relevant evidence, structure the response clearly, and cite accurately.
- Missing information: add rubric details and real source notes for a stronger result.

# Section Plan With Word Counts
- Introduction: 10% of the word count. Define the topic, give context, and present the thesis.
- Main Section 1: 25% of the word count. Develop the first major argument with evidence.
- Main Section 2: 25% of the word count. Develop the second major argument with evidence.
- Counterpoint or Evaluation: 25% of the word count. Show critical thinking and evaluate limitations.
- Conclusion: 15% of the word count. Synthesize the argument and close clearly.

# Writing Plan
1. Write the introduction after clarifying the thesis.
2. Write each main section with a clear topic sentence, evidence, analysis, and link back to the brief.
3. Add a counterpoint or evaluation section to improve critical depth.
4. Write the conclusion last so it reflects the full argument.

# Section-by-Section Draft

## Introduction
This assignment addresses ${shortTitle(input)}. It should define the central issue, explain why the topic matters, and establish a clear thesis. [Add source: author/year]

## Main Section 1
The first section should develop the strongest supporting point. Begin with a topic sentence, add evidence from a real source, and explain how that evidence supports the argument. [Add source: author/year]

## Main Section 2
The second section should build on the argument with another major point. Use evidence carefully and avoid making claims that are not supported by sources. [Add source: author/year]

## Counterpoint or Evaluation
A stronger assignment should acknowledge complexity. This section can discuss a limitation, alternative interpretation, or counterargument, then explain how it affects the overall thesis. [Add source: author/year]

## Conclusion
The conclusion should synthesize the argument rather than repeat each paragraph. It should return to the thesis, summarize the strongest insight, and close with the wider implication.

# Humanized Final Draft
This assignment explores ${shortTitle(input)} through a clear argument built from the brief, evidence, and marking criteria. The introduction should set up the issue in plain academic language, define key terms, and lead into a focused thesis. Each body section should then develop one idea at a time, using real evidence where the placeholders appear. The final version should sound natural and confident while staying precise, properly cited, and easy to check against the rubric.

# Final Checks Before Submission
- Replace every citation placeholder with a real source.
- Check the final structure against the rubric.
- Confirm the final word count.
- Verify all facts, dates, names, and definitions.
- Make sure each paragraph answers the assignment question.
- Format citations and references in the required style.
- Edit the final wording so it reflects your own understanding.`,
      raw: { mock: true, kind, requestId },
    };
  }

  if (kind === "humanize") {
    return {
      ok: true,
      result: humanizeFallback(input),
      raw: { mock: true, kind, requestId },
    };
  }

  return {
    ok: true,
    result: `Mock PowerPoint outline\n\nSlide 1: ${shortTitle(input)}\n- Introduce the topic\n- State the central argument\n- Preview the structure\nSuggested visual: Clean title slide\nSpeaker notes: Open by explaining why this topic matters.\n\nSlide 2: Context\n- Define key terms\n- Summarize background\n- Identify the debate\nSuggested visual: Timeline or concept map\nSpeaker notes: Give the audience enough context to follow the argument.\n\nSlide 3: Main Evidence\n- Present one core source\n- Explain the finding\n- Link it to your argument\nSuggested visual: Quote, chart, or source card\nSpeaker notes: Focus on analysis rather than reading the slide.\n\nSlide 4: Conclusion\n- Return to the thesis\n- Name the strongest takeaway\n- End with an implication\nSuggested visual: Final summary statement\nSpeaker notes: Close clearly and avoid introducing new material.`,
    raw: { mock: true, kind, requestId },
  };
}

function humanizeFallback(input: string): string {
  return input
    .replace(/\bIn order to\b/gi, "To")
    .replace(/\bdue to the fact that\b/gi, "because")
    .replace(/\bit is important to note that\b/gi, "")
    .replace(/\bhas the ability to\b/gi, "can")
    .replace(/\bAdditionally,?\s+/gi, "Also, ")
    .replace(/\bserves as\b/gi, "is")
    .replace(/\bstands as\b/gi, "is")
    .replace(/[—–]/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function stringValue(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function shortTitle(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 72) || "Untitled";
}
