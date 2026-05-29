"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Mode = "assignment" | "humanizer" | "powerpoint";

type ApiResponse = {
  ok?: boolean;
  output?: string;
  result?: string;
  text?: string;
  error?: string;
  message?: string;
};

type HistoryEntry = {
  id: string;
  mode: Mode;
  title: string;
  preview: string;
  output: string;
  createdAt: string;
};

const HISTORY_KEY = "assignai-history";
const levels = ["High School", "College", "University", "Graduate"];
const wordCounts = ["500", "750", "1000", "1500", "2000"];
const assignmentTones = ["Academic", "Analytical", "Persuasive", "Informative", "Professional"];
const draftTypes = ["Full structured draft", "Detailed outline", "Improve my draft", "Plan only"];
const citationStyles = ["Not specified", "Harvard", "APA 7", "MLA", "Chicago", "IEEE", "OSCOLA"];
const humanizerTones = ["Natural", "Conversational", "Professional", "Friendly", "Confident"];
const subjects = ["General", "English", "History", "Science", "Business", "Technology", "Health"];
const slideCounts = ["4", "5", "6", "8", "10", "12"];
const deckStyles = ["Academic briefing", "Seminar talk", "Research pitch", "Case study", "Client-ready"];
const audiences = ["Tutor", "Classmates", "Academic panel", "Client", "General audience"];

const modeCopy: Record<Mode, { label: string; icon: string; eyebrow: string; output: string; cta: string; placeholder: string }> = {
  assignment: {
    label: "Assignment Writer",
    icon: "✍",
    eyebrow: "Assignment workspace",
    output: "Generated assignment",
    cta: "Generate assignment",
    placeholder: "Paste the assignment question or describe what you need to write. Add your argument if you already have one...",
  },
  humanizer: {
    label: "Humanizer",
    icon: "✦",
    eyebrow: "Natural rewrite workspace",
    output: "Humanized version",
    cta: "Humanize text",
    placeholder: "Paste text that feels robotic, stiff, or overly formal. I’ll make it read more naturally without changing the meaning...",
  },
  powerpoint: {
    label: "PowerPoint Creator",
    icon: "▣",
    eyebrow: "Presentation workspace",
    output: "PowerPoint outline",
    cta: "Create slides",
    placeholder: "Describe the presentation topic, key ideas, marking criteria, and anything the audience needs to understand...",
  },
};

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("assignment");
  const [assignmentPrompt, setAssignmentPrompt] = useState("");
  const [rubric, setRubric] = useState("");
  const [sources, setSources] = useState("");
  const [draftType, setDraftType] = useState(draftTypes[0]);
  const [citationStyle, setCitationStyle] = useState(citationStyles[0]);
  const [level, setLevel] = useState(levels[1]);
  const [wordCount, setWordCount] = useState(wordCounts[2]);
  const [assignmentTone, setAssignmentTone] = useState(assignmentTones[0]);
  const [subject, setSubject] = useState(subjects[0]);
  const [humanizerText, setHumanizerText] = useState("");
  const [humanizerTone, setHumanizerTone] = useState(humanizerTones[0]);
  const [powerpointPrompt, setPowerpointPrompt] = useState("");
  const [slideCount, setSlideCount] = useState(slideCounts[2]);
  const [deckStyle, setDeckStyle] = useState(deckStyles[0]);
  const [audience, setAudience] = useState(audiences[0]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved) as HistoryEntry[]);
    } catch {
      window.localStorage.removeItem(HISTORY_KEY);
    }
  }, []);

  const activeInput = useMemo(() => {
    if (mode === "assignment") return assignmentPrompt.trim();
    if (mode === "humanizer") return humanizerText.trim();
    return powerpointPrompt.trim();
  }, [assignmentPrompt, humanizerText, mode, powerpointPrompt]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setOutput("");
    setCopied(false);

    if (!activeInput) {
      setError(inputErrorForMode(mode));
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(endpointForMode(mode), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadForMode(mode)),
      });

      let data: ApiResponse = {};
      try {
        data = (await response.json()) as ApiResponse;
      } catch {
        // Non-JSON responses are handled by the status/output checks below.
      }

      if (!response.ok || data.ok === false) {
        throw new Error(data.result || data.error || data.message || "The request failed. Please try again.");
      }

      const generated = data.output || data.result || data.text || "";
      if (!generated) throw new Error("No output was returned from the server.");
      setOutput(generated);
      saveHistory(generated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadOutput() {
    if (!output) return;
    const blob = new Blob([output], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = mode === "powerpoint" ? "assignai-slides.md" : "assignai-output.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function downloadPowerPoint() {
    if (mode !== "powerpoint" || (!activeInput && !output)) return;
    setError("");
    setDownloading(true);

    try {
      const response = await fetch("/api/powerpoint/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payloadForMode("powerpoint"), input: output || powerpointPrompt, deckText: output }),
      });

      if (!response.ok) {
        let data: ApiResponse = {};
        try {
          data = (await response.json()) as ApiResponse;
        } catch {
          // Fall through to the generic message below.
        }
        throw new Error(data.result || data.error || data.message || "PowerPoint download failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "assignai-presentation.pptx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "PowerPoint download failed.");
    } finally {
      setDownloading(false);
    }
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setOutput("");
    setCopied(false);
  }

  function saveHistory(generated: string) {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      mode,
      title: activeInput.replace(/\s+/g, " ").slice(0, 48) || modeCopy[mode].label,
      preview: generated.replace(/\s+/g, " ").slice(0, 90),
      output: generated,
      createdAt: new Date().toISOString(),
    };

    const nextHistory = [entry, ...history].slice(0, 8);
    setHistory(nextHistory);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
  }

  function openHistoryEntry(entry: HistoryEntry) {
    setMode(entry.mode);
    setOutput(entry.output);
    setError("");
    setCopied(false);
  }

  function endpointForMode(currentMode: Mode) {
    if (currentMode === "assignment") return "/api/assignment";
    if (currentMode === "humanizer") return "/api/humanize";
    return "/api/powerpoint";
  }

  function payloadForMode(currentMode: Mode) {
    if (currentMode === "assignment") {
      return {
        input: assignmentPrompt,
        prompt: assignmentPrompt,
        rubric,
        sources,
        draftType,
        citationStyle,
        level,
        wordCount: Number(wordCount),
        tone: assignmentTone,
        subject,
      };
    }

    if (currentMode === "humanizer") {
      return { input: humanizerText, text: humanizerText, tone: humanizerTone };
    }

    return { input: powerpointPrompt, topic: powerpointPrompt, audience, slideCount: Number(slideCount), style: deckStyle };
  }

  const copy = modeCopy[mode];

  return (
    <main className="min-h-screen bg-[#f7f1e8] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col lg:flex-row">
        <aside className="border-b border-stone-200/80 bg-[#fbf7ef]/85 px-4 py-4 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-4 lg:block">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-stone-300 bg-stone-950 text-sm font-semibold text-white shadow-sm">
                AI
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight text-stone-950">AssignAI</p>
                <p className="hidden text-xs text-stone-500 sm:block">Writing and presentation studio</p>
              </div>
            </div>
            <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 lg:mt-5 lg:inline-flex">
              Beta
            </div>
          </div>

          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="AssignAI tools">
            {(["assignment", "humanizer", "powerpoint"] as Mode[]).map((item) => (
              <SidebarButton
                key={item}
                active={mode === item}
                icon={modeCopy[item].icon}
                label={modeCopy[item].label}
                onClick={() => switchMode(item)}
              />
            ))}
            <a
              href="#history"
              className="flex min-w-max items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-sm text-stone-600 transition hover:bg-white hover:text-stone-950 lg:w-full"
            >
              <span className="text-base">◷</span>History
            </a>
          </nav>

          <div id="history" className="mt-6 hidden rounded-3xl border border-stone-200 bg-white/55 p-4 shadow-sm lg:block">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">History</p>
              <span className="h-2 w-2 rounded-full bg-stone-300" />
            </div>
            <div className="space-y-2 text-sm text-stone-500">
              {history.length > 0 ? (
                history.map((entry) => <HistoryButton key={entry.id} entry={entry} onClick={() => openHistoryEntry(entry)} />)
              ) : (
                <HistoryItem title="No saved runs yet" meta="Generated outputs will appear here." />
              )}
            </div>
          </div>
        </aside>

        <section className="flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto flex max-w-4xl flex-col gap-6">
            <header className="pt-4 text-center sm:pt-10 lg:pt-16">
              <p className="mx-auto mb-4 inline-flex rounded-full border border-stone-200 bg-white/65 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-stone-500 shadow-sm">
                {copy.eyebrow}
              </p>
              <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl lg:text-6xl">
                What do you want to create today?
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
                Generate structured assignments, rewrite stiff text, and export presentation-ready PowerPoint decks.
              </p>
            </header>

            <form onSubmit={handleSubmit} className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-3 shadow-[0_24px_80px_rgba(68,53,35,0.10)]">
              <div className="flex flex-wrap gap-2 border-b border-stone-100 px-2 pb-3 pt-1">
                {(["assignment", "humanizer", "powerpoint"] as Mode[]).map((item) => (
                  <ModePill key={item} active={mode === item} onClick={() => switchMode(item)}>
                    {modeCopy[item].label}
                  </ModePill>
                ))}
              </div>

              <label className="block px-1 pt-3">
                <span className="sr-only">{copy.label} prompt</span>
                <textarea
                  value={mode === "assignment" ? assignmentPrompt : mode === "humanizer" ? humanizerText : powerpointPrompt}
                  onChange={(event) => {
                    if (mode === "assignment") setAssignmentPrompt(event.target.value);
                    if (mode === "humanizer") setHumanizerText(event.target.value);
                    if (mode === "powerpoint") setPowerpointPrompt(event.target.value);
                  }}
                  rows={7}
                  placeholder={copy.placeholder}
                  className="min-h-[11rem] w-full resize-none rounded-[1.5rem] border-0 bg-transparent px-4 py-4 text-base leading-7 text-stone-900 outline-none placeholder:text-stone-400"
                />
              </label>

              <div className="grid gap-2 px-2 pb-2 sm:grid-cols-2 lg:grid-cols-4">
                {mode === "assignment" ? (
                  <>
                    <SelectField label="Draft type" value={draftType} onChange={setDraftType} options={draftTypes} />
                    <SelectField label="Citation" value={citationStyle} onChange={setCitationStyle} options={citationStyles} />
                    <SelectField label="Level" value={level} onChange={setLevel} options={levels} />
                    <SelectField label="Words" value={wordCount} onChange={setWordCount} options={wordCounts} />
                    <SelectField label="Tone" value={assignmentTone} onChange={setAssignmentTone} options={assignmentTones} />
                    <SelectField label="Subject" value={subject} onChange={setSubject} options={subjects} />
                    <TextAreaField
                      label="Rubric / marking criteria"
                      value={rubric}
                      onChange={setRubric}
                      placeholder="Paste the marking criteria, learning outcomes, or tutor notes here."
                    />
                    <TextAreaField
                      label="Sources / evidence notes"
                      value={sources}
                      onChange={setSources}
                      placeholder="Paste real sources, quotes, readings, links, or evidence notes. If empty, placeholders will be used."
                    />
                  </>
                ) : null}

                {mode === "humanizer" ? (
                  <>
                    <SelectField label="Tone" value={humanizerTone} onChange={setHumanizerTone} options={humanizerTones} />
                    <div className="hidden rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-3 py-2 text-xs text-stone-500 sm:block lg:col-span-3">
                      Tip: keep original details in the text so the rewrite stays faithful to your meaning.
                    </div>
                  </>
                ) : null}

                {mode === "powerpoint" ? (
                  <>
                    <SelectField label="Audience" value={audience} onChange={setAudience} options={audiences} />
                    <SelectField label="Slides" value={slideCount} onChange={setSlideCount} options={slideCounts} />
                    <SelectField label="Style" value={deckStyle} onChange={setDeckStyle} options={deckStyles} />
                    <div className="hidden rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-3 py-2 text-xs text-stone-500 lg:block">
                      Generates an outline first, then exports a `.pptx` deck.
                    </div>
                  </>
                ) : null}
              </div>

              {error ? (
                <div className="mx-2 mb-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-stone-100 px-2 pb-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-stone-500">
                  Drafting support only. Review facts, sources, and citations before using any output.
                </p>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Working..." : copy.cta}
                  <span className="ml-2">→</span>
                </button>
              </div>
            </form>

            <section className="rounded-[2rem] border border-stone-200 bg-[#fffdf8]/90 p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Output</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">{copy.output}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {mode === "powerpoint" ? (
                    <button
                      type="button"
                      onClick={downloadPowerPoint}
                      disabled={downloading || (!output && !activeInput)}
                      className="rounded-full border border-stone-900 bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {downloading ? "Building PPTX..." : "Download PPTX"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={downloadOutput}
                    disabled={!output}
                    className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Download text
                  </button>
                  <button
                    type="button"
                    onClick={copyOutput}
                    disabled={!output}
                    className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="min-h-[20rem] rounded-[1.5rem] border border-stone-200 bg-white p-5">
                {loading ? (
                  <div className="flex h-full min-h-[18rem] flex-col items-center justify-center text-center text-stone-500">
                    <div className="mb-4 h-9 w-9 animate-spin rounded-full border-2 border-stone-200 border-t-stone-900" />
                    <p className="font-medium text-stone-800">Creating your result</p>
                    <p className="mt-1 text-sm">This usually only takes a moment.</p>
                  </div>
                ) : output ? (
                  <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-stone-800">{output}</pre>
                ) : (
                  <div className="flex h-full min-h-[18rem] flex-col items-center justify-center text-center text-stone-500">
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-200 bg-[#fbf7ef] text-xl">✦</div>
                    <p className="font-medium text-stone-800">Your output will appear below the composer.</p>
                    <p className="mt-2 max-w-sm text-sm">Choose a tool, add your prompt, and review the generated result here.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-[2rem] border border-amber-200 bg-amber-50/80 p-5 text-sm leading-6 text-amber-950 shadow-sm">
              <p className="font-semibold">Academic integrity checklist</p>
              <p className="mt-1 text-amber-900/80">
                Use AssignAI to plan, draft, and polish. Add your own research, verify claims, and cite any source ideas before submission.
              </p>
            </section>

            <section className="rounded-[2rem] border border-stone-200 bg-white/55 p-5 shadow-sm lg:hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">History</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {history.length > 0 ? (
                  history.map((entry) => <HistoryButton key={entry.id} entry={entry} onClick={() => openHistoryEntry(entry)} />)
                ) : (
                  <HistoryItem title="No saved runs yet" meta="Generated outputs will appear here." />
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function inputErrorForMode(mode: Mode): string {
  if (mode === "assignment") return "Paste the assignment brief or describe what you need to write.";
  if (mode === "humanizer") return "Paste text to humanize.";
  return "Describe the presentation you want created.";
}

function SidebarButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-max items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm transition lg:w-full ${
        active
          ? "border-stone-200 bg-white text-stone-950 shadow-sm"
          : "border-transparent text-stone-600 hover:bg-white/75 hover:text-stone-950"
      }`}
    >
      <span className="text-base">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

function ModePill({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-stone-900 bg-stone-950 text-white"
          : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-950"
      }`}
    >
      {children}
    </button>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="block rounded-2xl border border-stone-200 bg-white px-3 py-2 shadow-sm">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full appearance-none bg-transparent text-sm font-medium text-stone-800 outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option} className="bg-white text-stone-900">
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block rounded-2xl border border-stone-200 bg-white px-3 py-2 shadow-sm lg:col-span-2">
      <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        placeholder={placeholder}
        className="mt-2 w-full resize-y border-0 bg-transparent text-sm leading-6 text-stone-800 outline-none placeholder:text-stone-400"
      />
    </label>
  );
}

function HistoryButton({ entry, onClick }: { entry: HistoryEntry; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-stone-200 bg-white/70 p-3 text-left transition hover:border-stone-300 hover:bg-white"
    >
      <span className="block truncate text-sm font-medium text-stone-700">{entry.title}</span>
      <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">{modeCopy[entry.mode].label}</span>
      <span className="mt-1 block text-xs leading-5 text-stone-500">{entry.preview}</span>
    </button>
  );
}

function HistoryItem({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white/70 p-3">
      <p className="truncate text-sm font-medium text-stone-700">{title}</p>
      <p className="mt-1 text-xs leading-5 text-stone-500">{meta}</p>
    </div>
  );
}
