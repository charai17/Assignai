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

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

type ChatCall = {
  system: string;
  prompt: string;
  temperature: number;
  requestId: string;
  stage?: string;
  config: ReturnType<typeof getConfig>;
};

type ChatCallResult = {
  ok: boolean;
  status: number;
  text: string;
  raw?: ChatResponse;
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
    return { status: 200, result: mockResult(kind, input, payload, requestId) };
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
  const targetWords = getTargetWordCount(payload, input);
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
- What the marker is likely looking for
- Missing information that affects quality

# Section Plan With Word Counts
Create the actual report/essay sections with target word counts. The section targets must add up to exactly ${targetWords} words. Use this exact line format for each section:
- Section title: 000 words. Purpose and evidence needed.

Planning rules:
- Do not create sections for administrative marking criteria such as referencing, structure, spelling, grammar, presentation, or formatting. Those criteria must be integrated across the whole answer.
- If the brief gives weighted content criteria, convert only the content criteria into report sections.
- If the brief asks for critical appraisal of two documents, create one content section called "Critical appraisal of two project management documents" and note the two documents as subsections or planned evidence.
- Use exact names, budgets, dates, constraints, and project labels from the brief when supplied.
- Do not invent the organisation, industry, team members, software names, statistics, or project facts when they are not supplied.

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
- You must write every section in the section plan. Do not stop after the introduction.
- Use only details the user supplied. Do not invent the organisation, industry, staff roles, software names, books, journal articles, URLs, DOI values, page numbers, quotes, statistics, or named authors.
- When evidence is needed but the user did not provide a source, use inline placeholders like [Add source: author/year for claim about X].
- Do not add "References used in this section" lists.
- Do not include brief analysis, writing plans, word-count checks, notes to the user, or final checklists.
- Return only the assignment/report draft.`,
  });

  if (!sectionDraft.ok) return assignmentStageError("section drafting", sectionDraft, requestId, config.ai.provider);

  const sectionTargets = extractSectionTargets(analysis.text, targetWords);
  const completedSectionDraft = await completeMissingDraftSections({
    config,
    requestId,
    sharedContext,
    analysis: analysis.text,
    sectionDraft: sectionDraft.text,
    sectionTargets,
  });

  const sectionVerification = await verifySectionWordCounts({
    config,
    requestId,
    sharedContext,
    analysis: analysis.text,
    sectionDraft: completedSectionDraft.draft,
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
- Remove any accidental "References used in this section" blocks.
- Return a clean assignment/report draft only.

Verified section draft:
${verifiedSectionDraft}

Return only the polished final draft. Keep all citation placeholders and real source mentions intact. Do not include a reference list here, notes, checks, or planning material.`,
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
- Do not add notes, checks, planning material, or "References used in this section" blocks.
- Return only the adjusted assignment/report draft.

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
  const wordCountSection = formatWordCountReport(wordReport, adjusted);
  const qualityNotice = formatQualityNotice(wordReport, sectionVerification.reports);

  return {
    status: 200,
    result: {
      ok: true,
      result: `${qualityNotice}${finalDraft.trim()}

${references}

${wordCountSection}`,
      raw: {
        requestId,
        provider: config.ai.provider,
        model: config.ai.openRouterModel,
        pipeline: [
          "analysis",
          "section-draft",
          completedSectionDraft.addedCount > 0 ? "missing-section-fill" : "section-completeness-check",
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

async function completeMissingDraftSections({
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
}): Promise<{ draft: string; addedCount: number }> {
  if (!sectionTargets.length) return { draft: sectionDraft, addedCount: 0 };

  const completedSections = splitDraftSections(sectionDraft);
  let addedCount = 0;

  for (let index = 0; index < sectionTargets.length; index += 1) {
    const target = sectionTargets[index];
    const alreadyDrafted = completedSections.some((section) => titleMatches(normalizeTitle(section.title), normalizeTitle(target.title)));
    if (alreadyDrafted) continue;

    const generated = await callOpenRouter({
      config,
      requestId,
      stage: `missing-section-${index + 1}`,
      temperature: 0.3,
      system: assignmentPipelineSystem("missing section draft"),
      prompt: `${sharedContext}

The section-by-section draft is missing one planned section. Draft only the missing section.

Approved analysis and plan:
${analysis}

Current draft:
${sectionDraft}

Missing section title: ${target.title}
Target for this section: ${target.target} words

Rules:
- Return only this missing section.
- Start with a markdown heading that matches the missing section title.
- Aim for the target word count.
- Use only source details the user supplied.
- Do not invent project facts, organisations, industries, staff roles, software names, books, journal articles, URLs, DOI values, page numbers, quotes, statistics, or named authors.
- If evidence is needed but no source details were supplied, use placeholders like [Add source: author/year for claim about X].
- Do not add a "References used in this section" list.
- Return only this section.`,
    });

    if (generated.ok && generated.text) {
      completedSections.push(normalizeRewrittenSection(generated.text, target.title));
      addedCount += 1;
    }
  }

  if (!completedSections.length) return { draft: sectionDraft, addedCount };

  return {
    draft: orderSectionsByPlan(completedSections, sectionTargets).map((section) => section.content.trim()).join("\n\n"),
    addedCount,
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
    const fallbackTarget = Math.max(50, Math.round((getTotalTarget(sectionTargets) || 1000) / sourceSections.length));
    const target = targets[index] || { title: original.title, target: fallbackTarget };
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
- If it is too short, add useful analysis tied to the brief and rubric.
- If it is too long, tighten wording without removing required evidence.
- Do not add unrelated sections.
- Do not add a "References used in this section" list.
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

async function callOpenRouter({ config, requestId, system, prompt, temperature, stage }: ChatCall): Promise<ChatCallResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ai.timeoutMs);

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${config.ai.openRouterApiKey}`,
      "x-request-id": requestId,
      "x-title": config.ai.appTitle,
    };

    if (config.ai.appUrl) headers["http-referer"] = config.ai.appUrl;

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

    const raw = (await response.json().catch(() => ({}))) as ChatResponse;
    const text = normalizeChatText(raw);

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

function assignmentStageError(stage: string, response: ChatCallResult, requestId: string, provider: string): GenerateResponse {
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
- Do not invent project facts, organisations, industries, people, software names, budgets, dates, or outcomes. Use supplied details only.
- If sources are missing, use precise placeholders like [Add source: author/year for claim about X].
- If citation style is not specified, say not specified and keep references as placeholders.
- Do not expose hidden chain-of-thought. Give concise visible reasoning, decisions, and output.
- Keep the result as a draft/study aid the user must review, source, and edit before submission.
- Keep headings clear and practical.
- For assignment/report output, return the student's deliverable, not the pipeline plan.
- Never turn marking criteria like referencing, structure, spelling, grammar, presentation, or formatting into standalone report sections.

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
- Word target used by AssignAI: ${targetWords}
- Selected citation style: ${stringValue(payload.citationStyle, "Not specified")}
- Selected draft type: ${stringValue(payload.draftType, "Full structured draft")}`;
}

function systemPromptFor(kind: ToolKind): string {
  if (kind === "assignment") return assignmentPipelineSystem("single-call-fallback");

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
  if (kind === "assignment") return assignmentContext(input, payload, getTargetWordCount(payload, input));

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

function normalizeChatText(raw: ChatResponse): string {
  return raw.choices?.[0]?.message?.content?.trim() || "";
}

function mockResult(kind: ToolKind, input: string, payload: Record<string, unknown>, requestId: string): ApiResult {
  if (kind === "assignment") {
    const target = getTargetWordCount(payload, input);
    const citation = stringValue(payload.citationStyle, "Not specified");
    const finalDraft = `# Assignment Draft

## Introduction

This draft is based on the supplied brief: ${shortTitle(input)}. It should introduce the task, define the project or topic using only confirmed details from the brief, and state the main argument or purpose of the assignment. Where evidence is needed, replace placeholders with verified academic or practitioner sources before use [Add source: author/year for assignment context].

## Main Discussion

The main body should follow the content criteria in the brief rather than administrative marking criteria. It should apply relevant concepts, explain how they relate to the project or question, and avoid adding unsupported project facts, organisations, software names, outcomes, statistics, or sources. If the brief requires a critical appraisal, the appraisal should evaluate the selected documents in context, showing strengths, limitations, and how each document supports project delivery [Add source: author/year for relevant theory].

## Reflection or Evaluation

Where reflection is required, it should connect personal or team learning to project management practice. It should be specific enough to be useful, but it should not invent team events that were not supplied by the user. Add real experience notes before using this section [Add source: author/year for reflective practice if required].

## Conclusion

The conclusion should synthesize the main points and return to the assignment task. It should not introduce new evidence. Before submission, the user should replace placeholders, check facts, and edit the wording so it reflects their own work.`;
    const wordReport = buildWordCountReport(finalDraft, target);

    return {
      ok: true,
      result: `${formatQualityNotice(wordReport, [])}${finalDraft}

${formatAlphabetizedReferences(extractReferenceCandidates(finalDraft), citation)}

${formatWordCountReport(wordReport, false)}`,
      raw: { mock: true, kind, requestId, wordCount: wordReport, sectionWordCounts: [] },
    };
  }

  if (kind === "humanize") return { ok: true, result: humanizeFallback(input), raw: { mock: true, kind, requestId } };

  return {
    ok: true,
    result: `Mock PowerPoint outline\n\nSlide 1: ${shortTitle(input)}\n- Introduce the topic\n- State the central argument\n- Preview the structure\nSuggested visual: Clean title slide\nSpeaker notes: Open by explaining why this topic matters.`,
    raw: { mock: true, kind, requestId },
  };
}

function extractSectionTargets(analysis: string, totalTarget: number): SectionTarget[] {
  const targets: SectionTarget[] = [];
  const sectionPlan = extractSection(analysis, "Section Plan With Word Counts") || analysis;

  for (const line of sectionPlan.split(/\r?\n/)) {
    const cleaned = line.trim().replace(/^[-*]\s+/, "");
    const match = cleaned.match(/^(.{2,100}?):\s*(\d{2,5})\s*words?\b/i)
      || cleaned.match(/^(.{2,100}?)\s*-\s*(\d{2,5})\s*words?\b/i)
      || cleaned.match(/^(.{2,100}?)\s*\((\d{2,5})\s*words?\)/i);

    if (!match) continue;
    const title = match[1].replace(/^#+\s*/, "").trim();
    const target = Number.parseInt(match[2], 10);
    if (isNonContentSectionTitle(title)) continue;
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
      if (currentLines.join("\n").trim()) {
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

function orderSectionsByPlan(sections: DraftSection[], targets: SectionTarget[]): DraftSection[] {
  if (!targets.length) return sections;
  const remaining = [...sections];
  const ordered: DraftSection[] = [];

  for (const target of targets) {
    const matchedIndex = remaining.findIndex((section) => titleMatches(normalizeTitle(section.title), normalizeTitle(target.title)));
    if (matchedIndex >= 0) {
      const [matched] = remaining.splice(matchedIndex, 1);
      ordered.push(matched);
    }
  }

  return [...ordered, ...remaining];
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
  const lines = text.split(/\r?\n/);
  const wanted = normalizeTitle(heading);
  const captured: string[] = [];
  let capturing = false;
  let headingLevel = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = normalizeTitle(headingMatch[2]);

      if (capturing && level <= headingLevel) break;

      if (!capturing && title === wanted) {
        capturing = true;
        headingLevel = level;
        continue;
      }
    }

    if (capturing) captured.push(line);
  }

  return captured.join("\n").trim();
}

function isNonContentSectionTitle(title: string): boolean {
  return /selected|inferred|word count|citation style|academic level|marker|missing information|references?|referencing|structure|spelling|grammar|formatting|presentation/i.test(title);
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
      if (!trimmed || /^#{1,4}\s+/.test(trimmed)) inReferenceBlock = false;
      else continue;
    }

    if (!inReferenceBlock) kept.push(line);
  }

  return kept.join("\n");
}

function getTargetWordCount(payload: Record<string, unknown>, input = ""): number {
  const value = payload.wordCount;
  const explicit = typeof value === "number"
    ? value
    : typeof value === "string" && !/auto/i.test(value)
      ? Number.parseInt(value.replace(/[^0-9]/g, ""), 10)
      : Number.NaN;
  const parsed = Number.isFinite(explicit) ? explicit : inferWordCountFromBrief(input, payload);

  if (!Number.isFinite(parsed)) return 1000;
  return Math.max(250, Math.min(5000, Math.round(parsed)));
}

function inferWordCountFromBrief(input: string, payload: Record<string, unknown>): number {
  const text = [
    input,
    stringValue(payload.rubric, ""),
    stringValue(payload.sources, ""),
  ].join("\n");
  const matches = Array.from(text.matchAll(/(?:word\s*count|words?|approximately|around|about|max(?:imum)?|limit)\D{0,24}(\d{3,5})|(\d{3,5})\D{0,16}(?:words?|word\s*count)/gi));

  for (const match of matches) {
    const value = Number.parseInt(match[1] || match[2], 10);
    if (Number.isFinite(value) && value >= 250 && value <= 5000) return value;
  }

  return 1000;
}

function buildWordCountReport(text: string, target: number): WordCountReport {
  const actual = countWords(text);
  const lower = Math.ceil(target * 0.9);
  const upper = Math.floor(target * 1.1);

  return { target, lower, upper, actual, withinRange: actual >= lower && actual <= upper };
}

function formatQualityNotice(wordReport: WordCountReport, sectionReports: SectionWordReport[]): string {
  const failedSections = sectionReports.filter((report) => !report.withinRange);
  if (wordReport.withinRange && !failedSections.length) return "";

  const sectionText = failedSections.length
    ? ` Section checks still need review for: ${failedSections.map((report) => report.title).join(", ")}.`
    : "";

  return `> Draft quality notice: the generated draft did not fully satisfy the code word-count checks. Target ${wordReport.target}, accepted ${wordReport.lower}-${wordReport.upper}, counted ${wordReport.actual}.${sectionText}\n\n`;
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
- Counting method: code counts words in the final report draft only, excluding references and this word-count note.`;
}

function extractReferenceCandidates(text: string): string[] {
  const candidates = new Set<string>();
  const lines = text.split(/\r?\n/);
  let inReferenceBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^#{1,4}\s+/.test(trimmed) && !/references? used|references?|sources?/i.test(trimmed)) inReferenceBlock = false;

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

    for (const match of Array.from(trimmed.matchAll(/\[Add source:[^\]]+\]/gi))) candidates.add(match[0].trim());
    for (const match of Array.from(trimmed.matchAll(/\(([A-Z][A-Za-z' -]+,\s*\d{4}[a-z]?)(?:,\s*[^)]*)?\)/g))) {
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
  return line.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").replace(/^["']|["']$/g, "").trim();
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
  const body = sorted.length ? sorted.map((reference) => `- ${reference}`).join("\n") : "- [Add source: author/year for each claim that needs evidence]";
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
