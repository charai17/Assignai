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

type OpenRouterCall = {
  system: string;
  prompt: string;
  temperature: number;
  requestId: string;
  stage?: string;
  config: ReturnType<typeof getConfig>;
};

type OpenRouterCallResult = {
  ok: boolean;
  status: number;
  text: string;
  raw?: OpenRouterResponse;
  error?: string;
};

type WordCountReport = {
  target: number;
  lower: number;
  upper: number;
  actual: number;
  withinRange: boolean;
};

type SectionTarget = {
  title: string;
  target: number;
};

type DraftSection = {
  title: string;
  content: string;
};

type SectionWordReport = WordCountReport & {
  title: string;
  attempts: number;
  adjusted: boolean;
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

  if (kind === "assignment") {
    return generateAssignmentPipeline({ input, payload, requestId, config });
  }

  const response = await callOpenRouter({
    config,
    requestId,
    system: systemPromptFor(kind),
    prompt: buildUserPrompt(kind, input, payload),
    temperature: kind === "humanize" ? 0.5 : 0.3,
  });

  if (!response.ok) {
    return {
      status: 502,
      result: {
        ok: false,
        result: response.error || `OpenRouter returned HTTP ${response.status}.`,
        raw: { requestId, provider: config.ai.provider, status: response.status },
      },
    };
  }

  return {
    status: 200,
    result: {
      ok: true,
      result: response.text || "OpenRouter returned an empty response.",
      raw: { requestId, provider: config.ai.provider, model: config.ai.openRouterModel },
    },
  };
}

async function generateAssignmentPipeline({
  input,
  payload,
  requestId,
  config,
}: Omit<GenerateRequest, "kind"> & { config: ReturnType<typeof getConfig> }): Promise<GenerateResponse> {
  const targetWords = getTargetWordCount(payload);
  const lower = Math.ceil(targetWords * 0.9);
  const upper = Math.floor(targetWords * 1.1);
  const sharedContext = assignmentContext(input, payload, targetWords);

  const analysis = await callOpenRouter({
    config,
    requestId,
    stage: "analysis",
    temperature: 0.2,
    system: assignmentPipelineSystem("analysis"),
    prompt: `${sharedContext}

Stage 1: Analyze the brief and create the assignment plan.

Return exactly these sections:
# Brief Analysis
- What the assignment is about
- Task type, such as essay, report, reflection, case study, discussion, or literature review
- Selected or inferred word count
- Selected or inferred citation style
- Academic level and subject
- What the marker is likely looking for
- Missing information that affects quality

# Section Plan With Word Counts
Create sections with target word counts. The section targets must add up to exactly ${targetWords} words. Use this exact line format for each section:
- Section title: 000 words. Purpose and evidence needed.

# Writing Plan
List the writing order and what each stage must achieve.`,
  });

  if (!analysis.ok) return assignmentStageError("analysis", analysis, requestId, config.ai.provider);

  const sectionDraft = await callOpenRouter({
    config,
    requestId,
    stage: "section-draft",
    temperature: 0.35,
    system: assignmentPipelineSystem("draft"),
    prompt: `${sharedContext}

Use this approved analysis and plan:
${analysis.text}

Stage 2: Write the assignment section by section.

Rules:
- Follow the section plan and word counts as closely as possible.
- Use markdown headings for every assignment section.
- Use clear headings that match the section plan.
- Use only source details the user supplied. Do not invent books, journal articles, URLs, DOI values, page numbers, quotes, statistics, or named authors.
- When evidence is needed but the user did not provide a source, use a placeholder like [Add source: author/year for claim about X].
- At the end of every drafted section, include a short list headed "References used in this section".
- Each reference list item must either be a real user-provided source detail or a source placeholder.
- Return only the section-by-section draft.`,
  });

  if (!sectionDraft.ok) return assignmentStageError("section drafting", sectionDraft, requestId, config.ai.provider);

  const sectionTargets = extractSectionTargets(analysis.text, targetWords);
  const sectionVerification = await verifySectionWordCounts({
    config,
    requestId,
    sharedContext,
    analysis: analysis.text,
    sectionDraft: sectionDraft.text,
    sectionTargets,
  });
  const verifiedSectionDraft = sectionVerification.draft;

  const humanizedDraft = await callOpenRouter({
    config,
    requestId,
    stage: "humanize-draft",
    temperature: 0.45,
    system: assignmentPipelineSystem("humanize"),
    prompt: `${sharedContext}

Stage 4: Humanize and polish the verified section draft into one coherent final draft.

Target word count: ${targetWords}
Accepted code-counted range for the full draft: ${lower} to ${upper} words

Important:
- The section draft below has already been checked section by section with code.
- Preserve the section headings, section balance, citations, and source placeholders.
- Do not allow humanizing to make any section much longer or shorter.

Verified section draft:
${verifiedSectionDraft}

Return only the polished final draft. Keep all citation placeholders and real source mentions intact. Do not include a reference list here.`,
  });

  if (!humanizedDraft.ok) return assignmentStageError("humanizing", humanizedDraft, requestId, config.ai.provider);

  let finalDraft = humanizedDraft.text;
  let wordReport = buildWordCountReport(finalDraft, targetWords);
  let adjusted = false;

  if (!wordReport.withinRange) {
    const adjustment = await callOpenRouter({
      config,
      requestId,
      stage: "final-word-count-adjustment",
      temperature: 0.25,
      system: assignmentPipelineSystem("final adjustment"),
      prompt: `${sharedContext}

Stage 5: Adjust this final draft so the code-counted total word count lands between ${lower} and ${upper} words.

Current code-counted words: ${wordReport.actual}
Target words: ${targetWords}
Accepted range: ${lower} to ${upper}

Rules:
- Preserve the argument, section headings, citations, and source placeholders.
- Keep section proportions close to the verified section draft.
- If the draft is too short, add useful analysis instead of filler.
- If the draft is too long, tighten wording without deleting key evidence.
- Do not add a reference list.
- Return only the adjusted final draft.

Draft:
${finalDraft}`,
    });

    if (adjustment.ok && adjustment.text) {
      finalDraft = adjustment.text;
      wordReport = buildWordCountReport(finalDraft, targetWords);
      adjusted = true;
    }
  }

  const references = formatAlphabetizedReferences(
    extractReferenceCandidates(`${verifiedSectionDraft}\n\n${finalDraft}`),
    stringValue(payload.citationStyle, "Not specified"),
  );
  const sectionWordCountSection = formatSectionWordCountReport(sectionVerification.reports);
  const wordCountSection = formatWordCountReport(wordReport, adjusted);

  return {
    status: 200,
    result: {
      ok: true,
      result: `${analysis.text.trim()}

# Section-by-Section Draft
${verifiedSectionDraft.trim()}

# Section Word Count Checks
${sectionWordCountSection}

# Humanized Final Draft
${finalDraft.trim()}

${references}

${wordCountSection}

# Final Checks Before Submission
- Replace every citation placeholder with a real source before submitting.
- Check the final draft against the rubric and marking criteria.
- Verify facts, names, dates, definitions, statistics, and quotations.
- Confirm the citation style and reference formatting with your course guidance.
- Read the draft once yourself and make edits that reflect your own understanding.`,
      raw: {
        requestId,
        provider: config.ai.provider,
        model: config.ai.openRouterModel,
        pipeline: [
          "analysis",
          "section-draft",
          "section-word-count-check",
          sectionVerification.adjustedCount > 0 ? "section-rewrite-loop" : "section-check-pass",
          "humanize-draft",
          adjusted ? "final-word-count-adjustment" : "final-word-count-check",
          "reference-sort",
        ],
        wordCount: wordReport,
        sectionWordCounts: sectionVerification.reports,
      },
    },
  };
}

async function verifySectionWordCounts({
  config,
  requestId,
  sharedContext,
  analysis,
  sectionDraft,
  sectionTargets,
}: {
  config: ReturnType<typeof getConfig>;
  requestId: string;
  sharedContext: string;
  analysis: string;
  sectionDraft: string;
  sectionTargets: SectionTarget[];
}): Promise<{ draft: string; reports: SectionWordReport[]; adjustedCount: number }> {
  const sections = splitDraftSections(sectionDraft);
  const sourceSections = sections.length ? sections : [{ title: "Assignment Draft", content: sectionDraft }];
  const targets = alignSectionTargets(sourceSections, sectionTargets);
  const verified: DraftSection[] = [];
  const reports: SectionWordReport[] = [];
  let adjustedCount = 0;

  for (let index = 0; index < sourceSections.length; index += 1) {
    const original = sourceSections[index];
    const target = targets[index] || { title: original.title, target: Math.max(250, Math.round(getTotalTarget(sectionTargets) / sourceSections.length)) };
    let section = original;
    let report = buildWordCountReport(stripReferenceBlocks(section.content), target.target);
    let attempts = 0;
    let adjusted = false;

    while (!report.withinRange && attempts < 2) {
      attempts += 1;
      const rewrite = await callOpenRouter({
        config,
        requestId,
        stage: `section-word-count-rewrite-${index + 1}-${attempts}`,
        temperature: 0.25,
        system: assignmentPipelineSystem("section word-count rewrite"),
        prompt: `${sharedContext}

Stage 3: Rewrite one assignment section so its own code-counted word count is within 10%.

Approved analysis and plan:
${analysis}

Section title: ${target.title}
Target for this section: ${target.target} words
Accepted range for this section: ${report.lower} to ${report.upper} words
Current code-counted section words: ${report.actual}
Rewrite attempt: ${attempts} of 2

Rules:
- Rewrite only this section.
- Preserve the section heading.
- Preserve the argument, citations, and source placeholders.
- Keep or recreate the "References used in this section" list at the end.
- If it is too short, add useful analysis tied to the brief and rubric.
- If it is too long, tighten wording without removing required evidence.
- Do not add unrelated sections.
- Return only this section.

Section to rewrite:
${section.content}`,
      });

      if (!rewrite.ok || !rewrite.text) break;
      section = normalizeRewrittenSection(rewrite.text, target.title);
      report = buildWordCountReport(stripReferenceBlocks(section.content), target.target);
      adjusted = true;
    }

    if (adjusted) adjustedCount += 1;
    verified.push(section);
    reports.push({ title: target.title, ...report, attempts, adjusted });
  }

  return {
    draft: verified.map((section) => section.content.trim()).join("\n\n"),
    reports,
    adjustedCount,
  };
}

async function callOpenRouter({
  config,
  requestId,
  system,
  prompt,
  temperature,
  stage,
}: OpenRouterCall): Promise<OpenRouterCallResult> {
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
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature,
      }),
      signal: controller.signal,
    });

    const raw = (await response.json().catch(() => ({}))) as OpenRouterResponse;
    const text = normalizeOpenRouterText(raw);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        text,
        raw,
        error: raw.error?.message || `OpenRouter returned HTTP ${response.status}${stage ? ` during ${stage}` : ""}.`,
      };
    }

    return { ok: true, status: response.status, text, raw };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? `AI request timed out${stage ? ` during ${stage}` : ""}. Please try again.`
      : error instanceof Error && error.message
        ? `AI request failed${stage ? ` during ${stage}` : ""}: ${error.message}`
        : `AI request failed${stage ? ` during ${stage}` : ""}.`;

    return { ok: false, status: 502, text: "", error: message };
  } finally {
    clearTimeout(timeout);
  }
}

function assignmentStageError(
  stage: string,
  response: OpenRouterCallResult,
  requestId: string,
  provider: string,
): GenerateResponse {
  return {
    status: 502,
    result: {
      ok: false,
      result: response.error || `Assignment pipeline failed during ${stage}.`,
      raw: { requestId, provider, stage, status: response.status },
    },
  };
}

function assignmentPipelineSystem(stage: string): string {
  return `You are AssignAI's Assignment Writer pipeline, stage: ${stage}.

Your job is to help create an editable academic draft from the user's brief. Be useful, structured, and careful.

Rules:
- Do not invent sources, quotes, statistics, page numbers, DOI values, URLs, or references.
- If sources are missing, use precise placeholders like [Add source: author/year for claim about X].
- If citation style is not specified, say not specified and keep references as placeholders.
- Do not expose hidden chain-of-thought. Give concise visible reasoning, decisions, and output.
- Keep the result as a draft/study aid the user must review, source, and edit before submission.
- Keep headings clear and practical.

${HUMANIZER_POLICY}`;
}

function assignmentContext(input: string, payload: Record<string, unknown>, targetWords: number): string {
  return `User prompt / assignment brief:
${input}

Optional rubric:
${stringValue(payload.rubric, "No rubric provided.")}

Optional extra information, source notes, evidence, or tutor instructions:
${stringValue(payload.sources, "No extra information provided. Use placeholders instead of inventing citations.")}

User-selected settings:
- Selected word target: ${targetWords}
- Selected citation style: ${stringValue(payload.citationStyle, "Not specified")}
- Selected academic level: ${stringValue(payload.level, "College")}
- Selected subject: ${stringValue(payload.subject, "General")}
- Selected tone: ${stringValue(payload.tone, "Academic")}
- Selected draft type: ${stringValue(payload.draftType, "Full structured draft")}`;
}

function systemPromptFor(kind: ToolKind): string {
  if (kind === "assignment") {
    return assignmentPipelineSystem("single-call-fallback");
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
    return assignmentContext(input, payload, getTargetWordCount(payload));
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
    const target = getTargetWordCount(payload);
    const citation = stringValue(payload.citationStyle, "Not specified");
    const introTarget = Math.round(target * 0.1);
    const firstTarget = Math.round(target * 0.25);
    const secondTarget = Math.round(target * 0.25);
    const evaluationTarget = Math.round(target * 0.25);
    const conclusionTarget = target - introTarget - firstTarget - secondTarget - evaluationTarget;
    const draft = `## Introduction
This assignment addresses ${shortTitle(input)}. It should define the central issue, explain why the topic matters, and establish a clear thesis. [Add source: author/year for background evidence]

References used in this section
- [Add source: author/year for background evidence]

## Main Section 1
The first section should develop the strongest supporting point. Begin with a topic sentence, add evidence from a real source, and explain how that evidence supports the argument. [Add source: author/year for first main claim]

References used in this section
- [Add source: author/year for first main claim]

## Main Section 2
The second section should build on the argument with another major point. Use evidence carefully and avoid making claims that are not supported by sources. [Add source: author/year for second main claim]

References used in this section
- [Add source: author/year for second main claim]

## Counterpoint or Evaluation
A stronger assignment should acknowledge complexity. This section can discuss a limitation, alternative interpretation, or counterargument, then explain how it affects the overall thesis. [Add source: author/year for counterpoint]

References used in this section
- [Add source: author/year for counterpoint]

## Conclusion
The conclusion should synthesize the argument rather than repeat each paragraph. It should return to the thesis, summarize the strongest insight, and close with the wider implication.`;
    const finalDraft = `This assignment explores ${shortTitle(input)} through a clear argument built from the brief, evidence, and marking criteria. The introduction should set up the issue in plain academic language, define key terms, and lead into a focused thesis. Each body section should then develop one idea at a time, using real evidence where the placeholders appear. The final version should sound natural and confident while staying precise, properly cited, and easy to check against the rubric.`;
    const wordReport = buildWordCountReport(finalDraft, target);
    const sectionReports = [
      { title: "Introduction", ...buildWordCountReport("This assignment addresses the topic and sets up the thesis.", introTarget), attempts: 0, adjusted: false },
      { title: "Main Section 1", ...buildWordCountReport("This section develops the first argument with evidence and explanation.", firstTarget), attempts: 0, adjusted: false },
      { title: "Main Section 2", ...buildWordCountReport("This section develops the second argument with evidence and explanation.", secondTarget), attempts: 0, adjusted: false },
      { title: "Counterpoint or Evaluation", ...buildWordCountReport("This section evaluates complexity and addresses a limitation or counterpoint.", evaluationTarget), attempts: 0, adjusted: false },
      { title: "Conclusion", ...buildWordCountReport("This section synthesizes the argument and closes the assignment.", conclusionTarget), attempts: 0, adjusted: false },
    ];

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
- Introduction: ${introTarget} words. Define the topic, give context, and present the thesis.
- Main Section 1: ${firstTarget} words. Develop the first major argument with evidence.
- Main Section 2: ${secondTarget} words. Develop the second major argument with evidence.
- Counterpoint or Evaluation: ${evaluationTarget} words. Show critical thinking and evaluate limitations.
- Conclusion: ${conclusionTarget} words. Synthesize the argument and close clearly.

# Writing Plan
1. Analyze the brief and rubric.
2. Draft each section using the section word count targets.
3. Check every section with code before humanizing.
4. Rewrite any section that is outside its 10% range.
5. Humanize the verified draft while preserving citations and placeholders.
6. Sort the extracted references alphabetically.
7. Run the code-based final word count check.

# Section-by-Section Draft
${draft}

# Section Word Count Checks
${formatSectionWordCountReport(sectionReports)}

# Humanized Final Draft
${finalDraft}

${formatAlphabetizedReferences(extractReferenceCandidates(draft), citation)}

${formatWordCountReport(wordReport, false)}

# Final Checks Before Submission
- Replace every citation placeholder with a real source.
- Check the final structure against the rubric.
- Verify all facts, dates, names, and definitions.
- Make sure each paragraph answers the assignment question.
- Format citations and references in the required style.
- Edit the final wording so it reflects your own understanding.`,
      raw: { mock: true, kind, requestId, wordCount: wordReport, sectionWordCounts: sectionReports },
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

function extractSectionTargets(analysis: string, totalTarget: number): SectionTarget[] {
  const targets: SectionTarget[] = [];
  const sectionPlan = extractSection(analysis, "Section Plan With Word Counts") || analysis;

  for (const line of sectionPlan.split(/\r?\n/)) {
    const cleaned = line.trim().replace(/^[-*]\s+/, "");
    const match = cleaned.match(/^(.{2,80}?):\s*(\d{2,5})\s*words?\b/i)
      || cleaned.match(/^(.{2,80}?)\s*-\s*(\d{2,5})\s*words?\b/i)
      || cleaned.match(/^(.{2,80}?)\s*\((\d{2,5})\s*words?\)/i);

    if (!match) continue;
    const title = match[1].replace(/^#+\s*/, "").trim();
    const target = Number.parseInt(match[2], 10);
    if (title && Number.isFinite(target) && target > 0) targets.push({ title, target });
  }

  if (targets.length) return normalizeSectionTargets(targets, totalTarget);
  return fallbackSectionTargets(totalTarget);
}

function normalizeSectionTargets(targets: SectionTarget[], totalTarget: number): SectionTarget[] {
  const total = getTotalTarget(targets);
  if (!total) return fallbackSectionTargets(totalTarget);
  if (Math.abs(total - totalTarget) <= Math.max(5, totalTarget * 0.02)) return targets;

  const normalized = targets.map((target) => ({
    title: target.title,
    target: Math.max(50, Math.round((target.target / total) * totalTarget)),
  }));
  const difference = totalTarget - getTotalTarget(normalized);
  normalized[normalized.length - 1].target += difference;
  return normalized;
}

function fallbackSectionTargets(totalTarget: number): SectionTarget[] {
  const intro = Math.round(totalTarget * 0.1);
  const first = Math.round(totalTarget * 0.25);
  const second = Math.round(totalTarget * 0.25);
  const evaluation = Math.round(totalTarget * 0.25);
  const conclusion = totalTarget - intro - first - second - evaluation;

  return [
    { title: "Introduction", target: intro },
    { title: "Main Section 1", target: first },
    { title: "Main Section 2", target: second },
    { title: "Counterpoint or Evaluation", target: evaluation },
    { title: "Conclusion", target: conclusion },
  ];
}

function splitDraftSections(text: string): DraftSection[] {
  const lines = text.split(/\r?\n/);
  const sections: DraftSection[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of lines) {
    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      if (currentLines.length) {
        sections.push({ title: currentTitle || `Section ${sections.length + 1}`, content: currentLines.join("\n").trim() });
      }
      currentTitle = heading[2].trim();
      currentLines = [line];
      continue;
    }

    currentLines.push(line);
  }

  if (currentLines.join("\n").trim()) {
    sections.push({ title: currentTitle || `Section ${sections.length + 1}`, content: currentLines.join("\n").trim() });
  }

  return sections.filter((section) => section.content.trim());
}

function alignSectionTargets(sections: DraftSection[], targets: SectionTarget[]): SectionTarget[] {
  if (!targets.length) return fallbackSectionTargets(1000).slice(0, sections.length);
  const unmatched = [...targets];

  return sections.map((section, index) => {
    const normalizedTitle = normalizeTitle(section.title);
    const matchedIndex = unmatched.findIndex((target) => titleMatches(normalizedTitle, normalizeTitle(target.title)));

    if (matchedIndex >= 0) {
      const [matched] = unmatched.splice(matchedIndex, 1);
      return matched;
    }

    return targets[index] || { title: section.title, target: Math.max(50, Math.round(getTotalTarget(targets) / sections.length)) };
  });
}

function normalizeRewrittenSection(text: string, expectedTitle: string): DraftSection {
  const trimmed = text.trim();
  const heading = trimmed.match(/^#{2,4}\s+(.+)$/m);
  if (heading) return { title: heading[1].trim(), content: trimmed };
  return { title: expectedTitle, content: `## ${expectedTitle}\n${trimmed}` };
}

function titleMatches(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getTotalTarget(targets: SectionTarget[]): number {
  return targets.reduce((sum, target) => sum + target.target, 0);
}

function extractSection(text: string, heading: string): string {
  const pattern = new RegExp(`^#\\s+${escapeRegExp(heading)}\\s*$([\\s\\S]*?)(?=^#\\s+|$)`, "im");
  return text.match(pattern)?.[1]?.trim() || "";
}

function stripReferenceBlocks(text: string): string {
  const kept: string[] = [];
  let inReferenceBlock = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (/^(#{1,4}\s*)?(references? used in this section|references?|sources?)\b/i.test(trimmed)) {
      inReferenceBlock = true;
      continue;
    }

    if (inReferenceBlock) {
      if (!trimmed || /^#{1,4}\s+/.test(trimmed)) {
        inReferenceBlock = false;
      } else {
        continue;
      }
    }

    if (!inReferenceBlock) kept.push(line);
  }

  return kept.join("\n");
}

function getTargetWordCount(payload: Record<string, unknown>): number {
  const value = payload.wordCount;
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number.parseInt(value.replace(/[^0-9]/g, ""), 10)
      : 1000;

  if (!Number.isFinite(parsed)) return 1000;
  return Math.max(250, Math.min(10000, Math.round(parsed)));
}

function buildWordCountReport(text: string, target: number): WordCountReport {
  const actual = countWords(text);
  const lower = Math.ceil(target * 0.9);
  const upper = Math.floor(target * 1.1);

  return {
    target,
    lower,
    upper,
    actual,
    withinRange: actual >= lower && actual <= upper,
  };
}

function countWords(text: string): number {
  const withoutUrls = text.replace(/https?:\/\/\S+/g, " ");
  return withoutUrls.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)?.length ?? 0;
}

function formatSectionWordCountReport(reports: SectionWordReport[]): string {
  if (!reports.length) return "- No section word-count checks were available.";

  return reports.map((report) => {
    const status = report.withinRange ? "Within 10%" : "Outside 10%";
    return `- ${report.title}: target ${report.target}, accepted ${report.lower} to ${report.upper}, counted ${report.actual}. Status: ${status}. Rewrite attempts: ${report.attempts}.`;
  }).join("\n");
}

function formatWordCountReport(report: WordCountReport, adjusted: boolean): string {
  const status = report.withinRange
    ? "Within 10% of the target word count."
    : "Outside the 10% range after the automatic adjustment attempt. Review or regenerate with a clearer target.";

  return `# Word Count Check
- Target: ${report.target} words
- Accepted range: ${report.lower} to ${report.upper} words
- Code-counted final draft words: ${report.actual}
- Status: ${status}
- Automatic final adjustment used: ${adjusted ? "Yes" : "No"}
- Counting method: code counts words in the Humanized Final Draft only, excluding analysis, section plan, references, and checklist.`;
}

function extractReferenceCandidates(text: string): string[] {
  const candidates = new Set<string>();
  const lines = text.split(/\r?\n/);
  let inReferenceBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^#{1,4}\s+/.test(trimmed) && !/references? used|references?|sources?/i.test(trimmed)) {
      inReferenceBlock = false;
    }

    if (/^(#{1,4}\s*)?(references? used in this section|references?|sources?)\b/i.test(trimmed)) {
      inReferenceBlock = true;
      continue;
    }

    if (inReferenceBlock) {
      if (!trimmed) {
        inReferenceBlock = false;
        continue;
      }

      const cleaned = cleanReferenceLine(trimmed);
      if (isReferenceLike(cleaned)) candidates.add(cleaned);
    }

    for (const match of trimmed.matchAll(/\[Add source:[^\]]+\]/gi)) {
      candidates.add(match[0].trim());
    }

    for (const match of trimmed.matchAll(/\(([A-Z][A-Za-z' -]+,\s*\d{4}[a-z]?)(?:,\s*[^)]*)?\)/g)) {
      candidates.add(`[Add full reference for: ${match[1]}]`);
    }
  }

  return sortReferencesAlphabetically(Array.from(candidates));
}

function isReferenceLike(value: string): boolean {
  if (!value || value.length < 4) return false;
  if (/^\[Add source:/i.test(value)) return true;
  if (/^\[Add full reference for:/i.test(value)) return true;
  if (/\b(19|20)\d{2}[a-z]?\b/.test(value)) return true;
  if (/doi:|https?:\/\/|journal|press|publisher|retrieved|vol\.|pp\./i.test(value)) return true;
  return false;
}

function cleanReferenceLine(line: string): string {
  return line
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function sortReferencesAlphabetically(references: string[]): string[] {
  return references
    .map((reference) => reference.trim())
    .filter(Boolean)
    .filter((reference, index, all) => all.findIndex((item) => normalizeReference(item) === normalizeReference(reference)) === index)
    .sort((a, b) => referenceSortKey(a).localeCompare(referenceSortKey(b)));
}

function normalizeReference(reference: string): string {
  return reference.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]$/g, "").trim();
}

function referenceSortKey(reference: string): string {
  return reference
    .replace(/^\[Add source:\s*/i, "")
    .replace(/^\[Add full reference for:\s*/i, "")
    .replace(/^[-*]\s*/, "")
    .replace(/^the\s+/i, "")
    .toLowerCase()
    .trim();
}

function formatAlphabetizedReferences(references: string[], citationStyle: string): string {
  const sorted = sortReferencesAlphabetically(references);
  const body = sorted.length
    ? sorted.map((reference) => `- ${reference}`).join("\n")
    : "- [Add source: author/year for each claim that needs evidence]";

  return `# Alphabetized References
Citation style: ${citationStyle}

${body}`;
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
    .replace(/[\u2014\u2013]/g, ",")
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
