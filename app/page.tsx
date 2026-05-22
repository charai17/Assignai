"use client";

import { FormEvent, useMemo, useState } from "react";

type Mode = "assignment" | "humanizer";

type ApiResponse = {
  ok?: boolean;
  output?: string;
  result?: string;
  text?: string;
  error?: string;
  message?: string;
};

const levels = ["High School", "College", "University", "Graduate"];
const wordCounts = ["500", "750", "1000", "1500", "2000"];
const assignmentTones = ["Academic", "Analytical", "Persuasive", "Informative", "Professional"];
const humanizerTones = ["Natural", "Conversational", "Professional", "Friendly", "Confident"];
const subjects = ["General", "English", "History", "Science", "Business", "Technology", "Health"];

const backendAgents = [
  {
    name: "Coordinator Agent",
    status: "Building",
    owner: "Mission sequence, file ownership, final integration",
    next: "Coordinating the assignment workflow wiring against production n8n.",
  },
  {
    name: "Webhook Integration Agent",
    status: "Wiring production n8n",
    owner: "Assignment webhook contract, retries, response mapping",
    next: "Assignment generation is being connected and tested with the production n8n webhook.",
  },
  {
    name: "API Safety Agent",
    status: "Active",
    owner: "Validation, input limits, rate limit, request IDs, health endpoint",
    next: "Adding safer request handling around the assignment workflow while integration tests run.",
  },
  {
    name: "Frontend Contract Agent",
    status: "Active",
    owner: "Keeps the UI connected to /api/assignment and /api/humanize",
    next: "Confirming the Assignment Writer stays wired to /api/assignment without changing the UI flow.",
  },
  {
    name: "QA / Observability Agent",
    status: "Testing",
    owner: "Build checks, curl tests, browser smoke test, console verification",
    next: "Smoke-testing the production assignment webhook path as each backend change lands.",
  },
  {
    name: "Humanizer Integration Agent",
    status: "Pending / mock",
    owner: "Humanizer webhook contract and response mapping",
    next: "Humanizer remains on the existing pending/mock path unless its production webhook is configured.",
  },
  {
    name: "Data / History Agent",
    status: "Optional later",
    owner: "Saved prompts, outputs, database history",
    next: "Starts only if you want history saved now.",
  },
  {
    name: "Auth / Credits Agent",
    status: "Optional later",
    owner: "Login, user limits, credits, paid usage foundation",
    next: "Recommended after production assignment workflow is verified.",
  },
];

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("assignment");
  const [assignmentPrompt, setAssignmentPrompt] = useState("");
  const [level, setLevel] = useState(levels[1]);
  const [wordCount, setWordCount] = useState(wordCounts[2]);
  const [assignmentTone, setAssignmentTone] = useState(assignmentTones[0]);
  const [subject, setSubject] = useState(subjects[0]);
  const [humanizerText, setHumanizerText] = useState("");
  const [humanizerTone, setHumanizerTone] = useState(humanizerTones[0]);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const isAssignment = mode === "assignment";
  const activeInput = useMemo(
    () => (isAssignment ? assignmentPrompt.trim() : humanizerText.trim()),
    [assignmentPrompt, humanizerText, isAssignment]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setOutput("");
    setCopied(false);

    if (!activeInput) {
      setError(isAssignment ? "Describe the assignment you want generated." : "Paste text to humanize.");
      return;
    }

    setLoading(true);
    try {
      const endpoint = isAssignment ? "/api/assignment" : "/api/humanize";
      const payload = isAssignment
        ? { input: assignmentPrompt, prompt: assignmentPrompt, level, wordCount: Number(wordCount), tone: assignmentTone, subject }
        : { input: humanizerText, text: humanizerText, tone: humanizerTone };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setError("");
    setOutput("");
    setCopied(false);
  }

  return (
    <main className="min-h-screen bg-[#f7f1e8] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col lg:flex-row">
        <aside className="border-b border-stone-200/80 bg-[#fbf7ef]/85 px-4 py-4 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-4 lg:block">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-stone-300 bg-stone-950 text-sm font-semibold text-white shadow-sm">
                  AH
                </div>
                <div>
                  <p className="text-sm font-semibold tracking-tight text-stone-950">Assignment AI</p>
                  <p className="hidden text-xs text-stone-500 sm:block">Minimal writing workspace</p>
                </div>
              </div>
            </div>
            <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 lg:mt-5 lg:inline-flex">
              Beta
            </div>
          </div>

          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:flex-col lg:overflow-visible lg:pb-0">
            <SidebarButton active={isAssignment} icon="✍" label="Assignment Writer" onClick={() => switchMode("assignment")} />
            <SidebarButton active={!isAssignment} icon="✨" label="Humanizer" onClick={() => switchMode("humanizer")} />
            <button
              type="button"
              disabled
              className="flex min-w-max items-center justify-between gap-3 rounded-2xl border border-transparent px-3 py-2.5 text-left text-sm text-stone-400 lg:w-full"
              title="Coming soon"
            >
              <span className="flex items-center gap-3"><span className="text-base">▣</span>PowerPoint Creator</span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-stone-500">Soon</span>
            </button>
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
              <HistoryItem title="No saved runs yet" meta="Generated outputs will appear here." />
              <HistoryItem title="Assignment drafts" meta="Coming after persistence is enabled." />
              <HistoryItem title="Humanized text" meta="Recent rewrites placeholder." />
            </div>
          </div>
        </aside>

        <section className="flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-10">
          <div className="mx-auto flex max-w-4xl flex-col gap-6">
            <header className="pt-4 text-center sm:pt-10 lg:pt-16">
              <p className="mx-auto mb-4 inline-flex rounded-full border border-stone-200 bg-white/65 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-stone-500 shadow-sm">
                AI writing workspace
              </p>
              <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-stone-950 sm:text-5xl lg:text-6xl">
                What do you want to write today?
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
                Generate structured assignments or make stiff text sound natural in a calm, focused workspace.
              </p>
            </header>

            <form onSubmit={handleSubmit} className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-3 shadow-[0_24px_80px_rgba(68,53,35,0.10)]">
              <div className="flex flex-wrap gap-2 border-b border-stone-100 px-2 pb-3 pt-1">
                <ModePill active={isAssignment} onClick={() => switchMode("assignment")}>Assignment Writer</ModePill>
                <ModePill active={!isAssignment} onClick={() => switchMode("humanizer")}>Humanizer</ModePill>
                <span className="inline-flex cursor-not-allowed items-center rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-400">
                  PowerPoint Creator · Soon
                </span>
              </div>

              <label className="block px-1 pt-3">
                <span className="sr-only">{isAssignment ? "Assignment instructions" : "Text to humanize"}</span>
                <textarea
                  value={isAssignment ? assignmentPrompt : humanizerText}
                  onChange={(event) => (isAssignment ? setAssignmentPrompt(event.target.value) : setHumanizerText(event.target.value))}
                  rows={7}
                  placeholder={
                    isAssignment
                      ? "Ask for an essay, report, discussion post, or outline. Include topic, rubric notes, and any sources to consider..."
                      : "Paste text that feels robotic, stiff, or overly formal. I’ll make it read more naturally..."
                  }
                  className="min-h-[11rem] w-full resize-none rounded-[1.5rem] border-0 bg-transparent px-4 py-4 text-base leading-7 text-stone-900 outline-none placeholder:text-stone-400"
                />
              </label>

              <div className="grid gap-2 px-2 pb-2 sm:grid-cols-2 lg:grid-cols-4">
                {isAssignment ? (
                  <>
                    <SelectField label="Level" value={level} onChange={setLevel} options={levels} />
                    <SelectField label="Words" value={wordCount} onChange={setWordCount} options={wordCounts} />
                    <SelectField label="Tone" value={assignmentTone} onChange={setAssignmentTone} options={assignmentTones} />
                    <SelectField label="Subject" value={subject} onChange={setSubject} options={subjects} />
                  </>
                ) : (
                  <>
                    <SelectField label="Tone" value={humanizerTone} onChange={setHumanizerTone} options={humanizerTones} />
                    <div className="hidden rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-3 py-2 text-xs text-stone-500 sm:block lg:col-span-3">
                      Tip: keep original details in the text so the rewrite stays faithful to your meaning.
                    </div>
                  </>
                )}
              </div>

              {error ? (
                <div className="mx-2 mb-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-stone-100 px-2 pb-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-stone-500">
                  Compact controls, focused drafting, and a clean result area below.
                </p>
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Working..." : isAssignment ? "Generate assignment" : "Humanize text"}
                  <span className="ml-2">→</span>
                </button>
              </div>
            </form>

            <section className="rounded-[2rem] border border-stone-200 bg-[#fffdf8]/90 p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Output</p>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">
                    {isAssignment ? "Generated assignment" : "Humanized version"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={copyOutput}
                  disabled={!output}
                  className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
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
                    <p className="mt-2 max-w-sm text-sm">
                      Choose a section, add your prompt, and review the generated writing here.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <section id="mission-control" className="rounded-[2rem] border border-stone-200 bg-[#15130f] p-5 text-white shadow-[0_24px_80px_rgba(68,53,35,0.18)] sm:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/80">Backend Mission Control</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">Agent build roster</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-300">
                    These agents are actively building and wiring the Assignment Writer workflow against the production n8n webhook. The Humanizer path remains pending/mock unless its production webhook is configured.
                  </p>
                </div>
                <div className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  Assignment build active
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {backendAgents.map((agent) => (
                  <MissionAgentCard key={agent.name} {...agent} />
                ))}
              </div>

              <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-stone-300">
                <span className="font-semibold text-white">Current focus:</span> production n8n assignment workflow wiring and verification. Humanizer stays pending/mock until a production webhook is configured.
              </div>
            </section>

            <section className="rounded-[2rem] border border-stone-200 bg-white/55 p-5 shadow-sm lg:hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">History</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <HistoryItem title="No saved runs yet" meta="Generated outputs will appear here." />
                <HistoryItem title="Assignment drafts" meta="Placeholder" />
                <HistoryItem title="Humanized text" meta="Placeholder" />
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function MissionAgentCard({ name, status, owner, next }: { name: string; status: string; owner: string; next: string }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.06] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-white">{name}</h3>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
          {status}
        </span>
      </div>
      <p className="text-sm leading-6 text-stone-300">{owner}</p>
      <p className="mt-3 rounded-2xl bg-black/20 px-3 py-2 text-xs leading-5 text-stone-400">
        <span className="font-semibold text-stone-200">Next:</span> {next}
      </p>
    </article>
  );
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

function HistoryItem({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white/70 p-3">
      <p className="truncate text-sm font-medium text-stone-700">{title}</p>
      <p className="mt-1 text-xs leading-5 text-stone-500">{meta}</p>
    </div>
  );
}
