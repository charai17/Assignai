export type CitationStyle = "apa" | "harvard";

export type CitationPassResult = {
  citedDraft: string;
  references: string[];
  sourcesNeeded: string[];
  citedClaims: number;
  placeholderClaims: number;
};

type ResearchSource = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
};

type OpenAlexWork = {
  id?: string;
  display_name?: string;
  publication_year?: number;
  doi?: string;
  cited_by_count?: number;
  host_venue?: { display_name?: string; url?: string };
  primary_location?: { source?: { display_name?: string }; landing_page_url?: string };
  authorships?: Array<{ author?: { display_name?: string } }>;
};

const MAX_CLAIMS_TO_RESEARCH = 30;
const SOURCE_LOOKUP_TIMEOUT_MS = 3_500;
const MIN_CLAIM_WORDS = 7;

export async function citeDraftClaims({
  draft,
  assignmentContext,
  citationStyle,
  requestId,
}: {
  draft: string;
  assignmentContext: string;
  citationStyle: string;
  requestId: string;
}): Promise<CitationPassResult> {
  const style = normalizeCitationStyle(citationStyle, `${assignmentContext}\n${draft}`);
  const references = new Map<string, string>();
  const sourcesNeeded = new Set<string>();
  let citedClaims = 0;
  let placeholderClaims = 0;
  let researchedClaims = 0;

  const citedDraft = await mapDraftSentences(draft, async (sentence) => {
    if (!needsCitation(sentence)) return sentence;
    if (hasInlineCitationOrPlaceholder(sentence)) return sentence;

    if (researchedClaims >= MAX_CLAIMS_TO_RESEARCH) {
      placeholderClaims += 1;
      const placeholder = sourcePlaceholder(sentence);
      sourcesNeeded.add(placeholder);
      return appendCitation(sentence, placeholder);
    }

    researchedClaims += 1;
    const source = await findSourceForClaim(sentence, assignmentContext, requestId);

    if (!source) {
      placeholderClaims += 1;
      const placeholder = sourcePlaceholder(sentence);
      sourcesNeeded.add(placeholder);
      return appendCitation(sentence, placeholder);
    }

    citedClaims += 1;
    references.set(referenceKey(source), formatReference(source, style));
    return appendCitation(sentence, inlineCitation(source, style));
  });

  return {
    citedDraft,
    references: Array.from(references.values()).sort((a, b) => referenceSortKey(a).localeCompare(referenceSortKey(b))),
    sourcesNeeded: Array.from(sourcesNeeded).sort((a, b) => referenceSortKey(a).localeCompare(referenceSortKey(b))),
    citedClaims,
    placeholderClaims,
  };
}

export function formatCitationSections({
  references,
  sourcesNeeded,
  citationStyle,
}: {
  references: string[];
  sourcesNeeded: string[];
  citationStyle: string;
}): string {
  const style = normalizeCitationStyle(citationStyle, "");
  const referenceBody = references.length
    ? references.map((reference) => `- ${reference}`).join("\n")
    : "- No verified academic sources were found. Add real sources for the inline placeholders before submission.";
  const neededBody = sourcesNeeded.length
    ? `\n\n# Sources Needed\n${sourcesNeeded.map((source) => `- ${source}`).join("\n")}`
    : "";

  return `# References
Citation style: ${style === "apa" ? "APA" : "Harvard"}

${referenceBody}${neededBody}`;
}

export function normalizeCitationStyle(style: string, context: string): CitationStyle {
  const combined = `${style}\n${context}`.toLowerCase();
  if (/\bapa\b|apa\s*7|american psychological association/.test(combined)) return "apa";
  return "harvard";
}

async function mapDraftSentences(draft: string, mapper: (sentence: string) => Promise<string>): Promise<string> {
  const output: string[] = [];

  for (const line of draft.split(/\r?\n/)) {
    if (!line.trim() || /^#{1,4}\s+/.test(line.trim()) || /^[-*]\s+/.test(line.trim())) {
      output.push(line);
      continue;
    }

    const parts = splitSentences(line);
    const mapped = [];
    for (const part of parts) mapped.push(await mapper(part));
    output.push(mapped.join(""));
  }

  return output.join("\n");
}

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+(?:["')\]]+)?\s*|[^.!?]+$/g);
  return parts || [text];
}

function needsCitation(sentence: string): boolean {
  const trimmed = sentence.trim();
  if (countWords(trimmed) < MIN_CLAIM_WORDS) return false;
  if (/^(i|we)\b/i.test(trimmed)) return false;
  if (/\?$/.test(trimmed)) return false;
  if (/\b(this section|the assignment|the report|the essay)\b/i.test(trimmed) && !/\b(argues|shows|demonstrates|suggests|indicates)\b/i.test(trimmed)) return false;

  return /\b(is|are|was|were|has|have|had|can|could|should|may|might|must|will|would|leads?|supports?|improves?|reduces?|increases?|requires?|depends?|reflects?|demonstrates?|suggests?|indicates?|shows?|highlights?|enables?|affects?|contributes?)\b/i.test(trimmed);
}

function hasInlineCitationOrPlaceholder(sentence: string): boolean {
  return /\[[^\]]*(add source|source needed|citation needed)[^\]]*\]/i.test(sentence)
    || /\([A-Z][A-Za-z' -]+(?:\s*&\s*[A-Z][A-Za-z' -]+| et al\.)?,\s*(19|20)\d{2}[a-z]?(?:,\s*p{1,2}\.?\s*\d+)?\)/.test(sentence);
}

async function findSourceForClaim(claim: string, assignmentContext: string, requestId: string): Promise<ResearchSource | null> {
  const query = buildSearchQuery(claim, assignmentContext);
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", "5");
  url.searchParams.set("sort", "relevance_score:desc");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SOURCE_LOOKUP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "AssignAI/0.1 research citation pass",
        "x-request-id": requestId,
      },
      signal: controller.signal,
    }).catch(() => null);

    if (!response?.ok) return null;
    const data = await response.json().catch(() => null) as { results?: OpenAlexWork[] } | null;
    const works = data?.results || [];
    const source = works.map(openAlexToSource).find(Boolean) || null;
    if (!source) return null;

    return source;
  } finally {
    clearTimeout(timeout);
  }
}

function openAlexToSource(work: OpenAlexWork): ResearchSource | null {
  const title = work.display_name?.trim();
  const authors = (work.authorships || [])
    .map((authorship) => authorship.author?.display_name?.trim())
    .filter((author): author is string => Boolean(author));

  if (!title || !authors.length || !work.publication_year) return null;

  return {
    id: work.doi || work.id || `${title}-${work.publication_year}`,
    title,
    authors,
    year: work.publication_year,
    venue: work.primary_location?.source?.display_name || work.host_venue?.display_name,
    doi: normalizeDoi(work.doi),
    url: work.primary_location?.landing_page_url || work.host_venue?.url || work.id,
  };
}

function buildSearchQuery(claim: string, assignmentContext: string): string {
  const combined = `${claim} ${assignmentContext}`;
  const words = Array.from(new Set(
    combined
      .toLowerCase()
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 3 && !STOP_WORDS.has(word))
  ));

  return words.slice(0, 14).join(" ") || claim.slice(0, 120);
}

function appendCitation(sentence: string, citation: string): string {
  const trailing = sentence.match(/\s*$/)?.[0] || "";
  const body = sentence.slice(0, sentence.length - trailing.length);
  const match = body.match(/([.!?])(["')\]]*)$/);
  if (!match) return `${body} ${citation}${trailing}`;

  return `${body.slice(0, match.index)} ${citation}${match[1]}${match[2]}${trailing}`;
}

function inlineCitation(source: ResearchSource, _style: CitationStyle): string {
  const author = source.authors.length > 2
    ? `${lastName(source.authors[0])} et al.`
    : source.authors.map(lastName).join(" & ");
  return `(${author}, ${source.year || "n.d."})`;
}

function formatReference(source: ResearchSource, style: CitationStyle): string {
  return style === "apa" ? formatApaReference(source) : formatHarvardReference(source);
}

function formatApaReference(source: ResearchSource): string {
  const authors = formatApaAuthors(source.authors);
  const year = source.year || "n.d.";
  const venue = source.venue ? ` ${source.venue}.` : "";
  const locator = source.doi ? ` https://doi.org/${source.doi}` : source.url ? ` ${source.url}` : "";
  return `${authors} (${year}). ${sentenceCase(source.title)}.${venue}${locator}`.replace(/\s+/g, " ").trim();
}

function formatHarvardReference(source: ResearchSource): string {
  const authors = formatHarvardAuthors(source.authors);
  const year = source.year || "n.d.";
  const venue = source.venue ? ` ${source.venue}.` : "";
  const locator = source.doi ? ` doi:${source.doi}.` : source.url ? ` Available at: ${source.url}` : "";
  return `${authors} (${year}) '${source.title}'.${venue}${locator}`.replace(/\s+/g, " ").trim();
}

function formatApaAuthors(authors: string[]): string {
  const formatted = authors.slice(0, 20).map((author) => {
    const parts = author.trim().split(/\s+/);
    const surname = parts.pop() || author;
    const initials = parts.map((part) => `${part[0]?.toUpperCase()}.`).join(" ");
    return initials ? `${surname}, ${initials}` : surname;
  });

  if (formatted.length <= 1) return formatted[0] || "Unknown author";
  return `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}`;
}

function formatHarvardAuthors(authors: string[]): string {
  if (!authors.length) return "Unknown author";
  if (authors.length === 1) return authors[0];
  if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
  return `${authors[0]} et al.`;
}

function sourcePlaceholder(sentence: string): string {
  return `[Add source: author/year for claim that ${claimSummary(sentence)}]`;
}

function claimSummary(sentence: string): string {
  return sentence
    .replace(/\[[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim()
    .slice(0, 90);
}

function referenceKey(source: ResearchSource): string {
  return (source.doi || source.id || `${source.authors[0]}-${source.year}-${source.title}`).toLowerCase();
}

function referenceSortKey(reference: string): string {
  return reference
    .replace(/^[-*]\s*/, "")
    .replace(/^the\s+/i, "")
    .replace(/^\[Add source:\s*/i, "")
    .toLowerCase()
    .trim();
}

function normalizeDoi(value?: string): string | undefined {
  return value?.replace(/^https?:\/\/doi\.org\//i, "").trim() || undefined;
}

function lastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] || name;
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  return trimmed ? `${trimmed[0].toUpperCase()}${trimmed.slice(1)}` : trimmed;
}

function countWords(text: string): number {
  return text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)?.length ?? 0;
}

const STOP_WORDS = new Set([
  "about",
  "above",
  "across",
  "after",
  "also",
  "although",
  "among",
  "because",
  "between",
  "brief",
  "could",
  "during",
  "each",
  "from",
  "have",
  "into",
  "more",
  "most",
  "must",
  "need",
  "needs",
  "only",
  "other",
  "project",
  "section",
  "should",
  "such",
  "than",
  "that",
  "their",
  "there",
  "these",
  "this",
  "through",
  "with",
  "within",
  "would",
]);
