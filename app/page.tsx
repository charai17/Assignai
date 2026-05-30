"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase";

type Mode = "assignment" | "humanizer" | "powerpoint";
type AuthMode = "sign-in" | "sign-up";

type ApiResponse = {
  ok?: boolean;
  output?: string;
  result?: string;
  text?: string;
  error?: string;
  message?: string;
  raw?: {
    job?: {
      id: string;
      status: string;
      output?: string | null;
      error?: string | null;
    };
    jobId?: string;
    persistence?: {
      saved?: boolean;
      generationId?: string | null;
      projectId?: string | null;
    };
  };
};

type PdfUploadResponse = {
  ok?: boolean;
  text?: string;
  filename?: string;
  pages?: number;
  truncated?: boolean;
  error?: string;
};

type HistoryEntry = {
  id: string;
  mode: Mode;
  title: string;
  preview: string;
  output: string;
  createdAt: string;
};

type GenerationRow = {
  id: string;
  mode: Mode;
  title: string;
  output: string;
  created_at: string;
};

const HISTORY_KEY = "assignai-history";
const wordCounts = ["Auto-detect", "500", "750", "1000", "1500", "2000", "3000", "4000", "5000"];
const draftTypes = ["Full staged draft", "Detailed plan only", "Improve my draft", "Section plan + draft"];
const citationStyles = ["Auto-detect", "Harvard", "APA 7", "MLA", "Chicago", "IEEE", "OSCOLA"];
const humanizerTones = ["Natural", "Conversational", "Professional", "Friendly", "Confident"];
const slideCounts = ["4", "5", "6", "8", "10", "12"];
const deckStyles = ["Academic briefing", "Seminar talk", "Research pitch", "Case study", "Client-ready"];
const audiences = ["Tutor", "Classmates", "Academic panel", "Client", "General audience"];

const modeCopy: Record<Mode, { label: string; icon: string; eyebrow: string; output: string; cta: string; placeholder: string }> = {
  assignment: {
    label: "Assignment Writer",
    icon: "A",
    eyebrow: "Assignment workflow",
    output: "Analyzed, planned, written, humanized",
    cta: "Analyze and write",
    placeholder: "Paste the full assignment brief or question here. Include the task, topic, deadline notes, and anything your tutor specifically asked for...",
  },
  humanizer: {
    label: "Humanizer",
    icon: "H",
    eyebrow: "Natural rewrite workspace",
    output: "Humanized version",
    cta: "Humanize text",
    placeholder: "Paste text that feels robotic, stiff, or overly formal. I will make it read more naturally without changing the meaning...",
  },
  powerpoint: {
    label: "PowerPoint Creator",
    icon: "P",
    eyebrow: "Presentation workspace",
    output: "PowerPoint outline",
    cta: "Create slides",
    placeholder: "Describe the presentation topic, key ideas, marking criteria, and anything the audience needs to understand...",
  },
};

export default function HomePage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<Mode>("assignment");
  const [assignmentPrompt, setAssignmentPrompt] = useState("");
  const [rubric, setRubric] = useState("");
  const [sources, setSources] = useState("");
  const [draftType, setDraftType] = useState(draftTypes[0]);
  const [citationStyle, setCitationStyle] = useState(citationStyles[0]);
  const [wordCount, setWordCount] = useState(wordCounts[0]);
  const [humanizerText, setHumanizerText] = useState("");
  const [humanizerTone, setHumanizerTone] = useState(humanizerTones[0]);
  const [powerpointPrompt, setPowerpointPrompt] = useState("");
  const [slideCount, setSlideCount] = useState(slideCounts[2]);
  const [deckStyle, setDeckStyle] = useState(deckStyles[0]);
  const [audience, setAudience] = useState(audiences[0]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("sign-up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [landingError, setLandingError] = useState("");
  const [pdfUploadStatus, setPdfUploadStatus] = useState("");
  const [pdfUploading, setPdfUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
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

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) void loadCloudHistory(data.user.id, supabase);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) void loadCloudHistory(session.user.id, supabase);
    });

    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const activeInput = useMemo(() => {
    if (mode === "assignment") return assignmentPrompt.trim();
    if (mode === "humanizer") return humanizerText.trim();
    return powerpointPrompt.trim();
  }, [assignmentPrompt, humanizerText, mode, powerpointPrompt]);

  const authProps: AccountPanelProps = {
    authMode,
    authStatus,
    email,
    password,
    supabaseReady: hasSupabaseConfig(),
    syncStatus,
    user,
    authLoading,
    onAuthModeChange: setAuthMode,
    onEmailChange: setEmail,
    onGoogleSignIn: handleGoogleSignIn,
    onPasswordChange: setPassword,
    onSignOut: signOut,
    onSubmit: handleAuth,
  };

  if (!user) {
    return (
      <PreSignupAssignmentPage
        assignmentPrompt={assignmentPrompt}
        authProps={authProps}
        citationStyle={citationStyle}
        draftType={draftType}
        landingError={landingError}
        pdfUploading={pdfUploading}
        pdfUploadStatus={pdfUploadStatus}
        rubric={rubric}
        sources={sources}
        wordCount={wordCount}
        onCitationStyleChange={setCitationStyle}
        onDraftTypeChange={setDraftType}
        onGenerate={handlePreSignupGenerate}
        onPdfUpload={handlePdfUpload}
        onPromptChange={setAssignmentPrompt}
        onRubricChange={setRubric}
        onSourcesChange={setSources}
        onWordCountChange={setWordCount}
      />
    );
  }

  async function handleGoogleSignIn() {
    setAuthStatus("");

    if (!supabase) {
      setAuthStatus("Supabase is not configured yet.");
      return;
    }

    setAuthLoading(true);
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });
    setAuthLoading(false);

    if (googleError) setAuthStatus(googleError.message);
  }

  async function handlePreSignupGenerate() {
    if (!assignmentPrompt.trim()) {
      setLandingError("Paste your assignment brief first, then create an account to generate it.");
      return;
    }

    setLandingError("");
    setAuthMode("sign-up");
    document.getElementById("signup")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handlePdfUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.type && file.type !== "application/pdf") {
      setPdfUploadStatus("Upload a PDF file.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    setPdfUploading(true);
    setPdfUploadStatus(`Reading ${file.name}...`);

    try {
      const response = await fetch("/api/upload/pdf", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as PdfUploadResponse;

      if (!response.ok || !data.ok || !data.text) {
        setPdfUploadStatus(data.error || "I could not read that PDF.");
        return;
      }

      const extracted = `PDF upload: ${data.filename || file.name}${data.pages ? ` (${data.pages} pages)` : ""}\n\n${data.text}`;
      setAssignmentPrompt((current) => current.trim() ? `${current.trim()}\n\n${extracted}` : extracted);
      setMode("assignment");
      setPdfUploadStatus(data.truncated ? "PDF text added. Long file was shortened to fit the prompt limit." : "PDF text added to the assignment brief.");
    } catch {
      setPdfUploadStatus("PDF upload failed. Try a smaller text-based PDF.");
    } finally {
      setPdfUploading(false);
    }
  }

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
      if (mode === "assignment" && user && supabase) {
        try {
          const generated = await generateAssignmentWithJob();
          setOutput(generated);
          await saveHistory(generated, true);
          return;
        } catch (jobError) {
          setSyncStatus("Tracked jobs are not ready yet. Using direct generation for this request.");
        }
      }

      const direct = await generateDirect(mode);
      setOutput(direct.generated);
      await saveHistory(direct.generated, direct.savedByBackend);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function generateDirect(currentMode: Mode): Promise<{ generated: string; savedByBackend: boolean }> {
    const response = await fetch(endpointForMode(currentMode), {
      method: "POST",
      headers: await apiHeaders(),
      body: JSON.stringify(payloadForMode(currentMode)),
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

    return { generated, savedByBackend: data.raw?.persistence?.saved === true };
  }

  async function generateAssignmentWithJob(): Promise<string> {
    const createResponse = await fetch("/api/jobs", {
      method: "POST",
      headers: await apiHeaders(),
      body: JSON.stringify({ ...payloadForMode("assignment"), kind: "assignment" }),
    });

    const created = (await createResponse.json()) as ApiResponse;
    if (!createResponse.ok || created.ok === false || !created.raw?.job?.id) {
      throw new Error(created.result || created.error || created.message || "Could not create the assignment job.");
    }

    setSyncStatus("Assignment job queued. Writing now...");

    const runResponse = await fetch(`/api/jobs/${created.raw.job.id}/run`, {
      method: "POST",
      headers: await apiHeaders(),
    });

    const run = (await runResponse.json()) as ApiResponse;
    if (!runResponse.ok || run.ok === false) {
      throw new Error(run.result || run.error || run.message || "The assignment job failed.");
    }

    const generated = run.output || run.result || run.text || run.raw?.job?.output || "";
    if (!generated) throw new Error("The assignment job finished without output.");
    return generated;
  }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthStatus("");

    if (!supabase) {
      setAuthStatus("Supabase is not configured yet.");
      return;
    }

    if (!email.trim() || password.length < 6) {
      setAuthStatus("Enter an email and a password with at least 6 characters.");
      return;
    }

    setAuthLoading(true);
    const authRequest = authMode === "sign-in"
      ? supabase.auth.signInWithPassword({ email: email.trim(), password })
      : supabase.auth.signUp({ email: email.trim(), password });

    const { data, error: authError } = await authRequest;
    setAuthLoading(false);

    if (authError) {
      setAuthStatus(authError.message);
      return;
    }

    if (authMode === "sign-up" && !data.session) {
      setAuthStatus("Account created. Check your email if confirmation is enabled.");
      return;
    }

    setUser(data.user ?? null);
    setAuthStatus(authMode === "sign-in" ? "Signed in." : "Account created.");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setSyncStatus("Signed out.");
    setOutput("");
    try {
      const saved = window.localStorage.getItem(HISTORY_KEY);
      setHistory(saved ? (JSON.parse(saved) as HistoryEntry[]) : []);
    } catch {
      setHistory([]);
    }
  }

  async function loadCloudHistory(userId: string, client: SupabaseClient = supabase as SupabaseClient) {
    setSyncStatus("Loading saved history...");
    const { data, error: historyError } = await client
      .from("generations")
      .select("id, mode, title, output, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12);

    if (historyError) {
      setSyncStatus("Local history is active. Run the Supabase schema if cloud history is not ready yet.");
      return;
    }

    const entries = ((data || []) as GenerationRow[]).map((row) => ({
      id: row.id,
      mode: row.mode,
      title: row.title,
      preview: row.output.replace(/\s+/g, " ").slice(0, 90),
      output: row.output,
      createdAt: row.created_at,
    }));

    setHistory(entries);
    setSyncStatus("Cloud history synced.");
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

  async function downloadDocument() {
    if (!output) return;
    setError("");
    setDownloading(true);

    try {
      const response = await fetch("/api/document/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: documentTitle(), content: output }),
      });

      if (!response.ok) {
        let data: ApiResponse = {};
        try {
          data = (await response.json()) as ApiResponse;
        } catch {
          // Fall through to the generic message below.
        }
        throw new Error(data.result || data.error || data.message || "Document download failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "assignai-document.docx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document download failed.");
    } finally {
      setDownloading(false);
    }
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

  async function saveHistory(generated: string, savedByBackend = false) {
    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      mode,
      title: activeInput.replace(/\s+/g, " ").slice(0, 56) || modeCopy[mode].label,
      preview: generated.replace(/\s+/g, " ").slice(0, 90),
      output: generated,
      createdAt: new Date().toISOString(),
    };

    const nextHistory = [entry, ...history].slice(0, 12);
    setHistory(nextHistory);
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));

    if (savedByBackend) {
      setSyncStatus("Saved to cloud history.");
      if (supabase && user) await loadCloudHistory(user.id, supabase);
      return;
    }

    if (!supabase || !user) {
      setSyncStatus(hasSupabaseConfig() ? "Saved on this device. Sign in to sync." : "Saved on this device.");
      return;
    }

    const payload = payloadForMode(mode);
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({ user_id: user.id, kind: mode, title: entry.title })
      .select("id")
      .single();

    const { error: generationError } = await supabase.from("generations").insert({
      user_id: user.id,
      project_id: projectError ? null : project?.id,
      mode,
      title: entry.title,
      input: activeInput,
      output: generated,
      metadata: payload,
    });

    await supabase.from("usage_events").insert({
      user_id: user.id,
      mode,
      input_chars: activeInput.length,
      output_chars: generated.length,
      model: "openrouter",
    });

    setSyncStatus(generationError ? "Saved locally. Cloud save needs the Supabase schema." : "Saved to cloud history.");
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

  async function apiHeaders(): Promise<HeadersInit> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (!supabase) return headers;

    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
    return headers;
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
        wordCount,
      };
    }

    if (currentMode === "humanizer") {
      return { input: humanizerText, text: humanizerText, tone: humanizerTone };
    }

    return { input: powerpointPrompt, topic: powerpointPrompt, audience, slideCount: Number(slideCount), style: deckStyle };
  }

  function documentTitle() {
    if (mode === "assignment") return assignmentPrompt.replace(/\s+/g, " ").slice(0, 80) || "AssignAI Assignment";
    if (mode === "humanizer") return "AssignAI Humanized Text";
    return "AssignAI Output";
  }

  const copy = modeCopy[mode];

  return (
    <main className="min-h-screen bg-[#f7f1e8] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col lg:flex-row">
        <aside className="border-b border-stone-200/80 bg-[#fbf7ef]/85 px-4 py-4 backdrop-blur lg:sticky lg:top-0 lg:h-screen lg:w-72 lg:shrink-0 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-4 lg:block">
            <LogoBlock />
            <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 lg:mt-5 lg:inline-flex">
              Beta
            </div>
          </div>

          <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="AssignAI tools">
            {(["assignment", "humanizer", "powerpoint"] as Mode[]).map((item) => (
              <SidebarButton key={item} active={mode === item} icon={modeCopy[item].icon} label={modeCopy[item].label} onClick={() => switchMode(item)} />
            ))}
          </nav>

          <AccountPanel {...authProps} />

          <div id="history" className="mt-4 hidden rounded-3xl border border-stone-200 bg-white/55 p-4 shadow-sm lg:block">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Saved</p>
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
          <div className="mx-auto flex max-w-5xl flex-col gap-6">
            <header className="flex flex-col gap-4 pt-2 sm:pt-6 lg:flex-row lg:items-end lg:justify-between lg:pt-10">
              <div>
                <p className="mb-3 inline-flex rounded-full border border-stone-200 bg-white/65 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-stone-500 shadow-sm">
                  {copy.eyebrow}
                </p>
                <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-5xl">
                  Build the work, keep the record.
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
                  Create assignments, humanize drafts, and build presentation outlines. Signed-in users get cloud history automatically.
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white/70 px-4 py-3 text-sm text-stone-600 shadow-sm">
                <span className="font-semibold text-stone-950">{history.length}</span> saved item{history.length === 1 ? "" : "s"}
              </div>
            </header>

            <ToolComposer
              assignmentPrompt={assignmentPrompt}
              audience={audience}
              citationStyle={citationStyle}
              deckStyle={deckStyle}
              draftType={draftType}
              error={error}
              humanizerText={humanizerText}
              humanizerTone={humanizerTone}
              loading={loading}
              mode={mode}
              pdfUploading={pdfUploading}
              pdfUploadStatus={pdfUploadStatus}
              powerpointPrompt={powerpointPrompt}
              rubric={rubric}
              slideCount={slideCount}
              sources={sources}
              wordCount={wordCount}
              onAssignmentPromptChange={setAssignmentPrompt}
              onAudienceChange={setAudience}
              onCitationStyleChange={setCitationStyle}
              onDeckStyleChange={setDeckStyle}
              onDraftTypeChange={setDraftType}
              onHumanizerTextChange={setHumanizerText}
              onHumanizerToneChange={setHumanizerTone}
              onModeChange={switchMode}
              onPdfUpload={handlePdfUpload}
              onPowerpointPromptChange={setPowerpointPrompt}
              onRubricChange={setRubric}
              onSlideCountChange={setSlideCount}
              onSourcesChange={setSources}
              onSubmit={handleSubmit}
              onWordCountChange={setWordCount}
            />

            <OutputEditor
              activeInput={activeInput}
              copied={copied}
              downloading={downloading}
              loading={loading}
              mode={mode}
              output={output}
              outputTitle={copy.output}
              onCopy={copyOutput}
              onDownloadDocument={downloadDocument}
              onDownloadOutput={downloadOutput}
              onDownloadPowerPoint={downloadPowerPoint}
              onOutputChange={setOutput}
            />

            <section className="rounded-3xl border border-amber-200 bg-amber-50/80 p-5 text-sm leading-6 text-amber-950 shadow-sm">
              <p className="font-semibold">Academic integrity checklist</p>
              <p className="mt-1 text-amber-900/80">
                Use AssignAI to plan, draft, and polish. Add your own research, verify claims, and cite any source ideas before submission.
              </p>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}

function PreSignupAssignmentPage(props: {
  assignmentPrompt: string;
  authProps: AccountPanelProps;
  citationStyle: string;
  draftType: string;
  landingError: string;
  pdfUploading: boolean;
  pdfUploadStatus: string;
  rubric: string;
  sources: string;
  wordCount: string;
  onCitationStyleChange: (value: string) => void;
  onDraftTypeChange: (value: string) => void;
  onGenerate: () => void;
  onPdfUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onPromptChange: (value: string) => void;
  onRubricChange: (value: string) => void;
  onSourcesChange: (value: string) => void;
  onWordCountChange: (value: string) => void;
}) {
  return (
    <main className="min-h-screen bg-[#f7f1e8] text-stone-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between border-b border-stone-200/80 pb-4">
          <LogoBlock />
          <a href="#signup" className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50">
            Sign up
          </a>
        </header>

        <section className="grid flex-1 items-start gap-6 py-8 lg:grid-cols-[minmax(0,1.25fr)_360px] lg:py-12">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-stone-200 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 shadow-sm">
              Assignment Writer
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-stone-950 sm:text-6xl">
              Paste your brief first. Sign up when you are ready to generate.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600">
              Start in the Assignment Writer. Add the brief, rubric, word count, citation style, and extra notes. When you click generate, AssignAI takes you to sign up so the result can be saved to your workspace.
            </p>

            <section className="mt-8 rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-3 shadow-[0_24px_80px_rgba(68,53,35,0.10)]">
              <PdfUploadField onUpload={props.onPdfUpload} uploading={props.pdfUploading} status={props.pdfUploadStatus} />

              <label className="block px-1 pt-2">
                <span className="sr-only">Assignment brief</span>
                <textarea value={props.assignmentPrompt} onChange={(event) => props.onPromptChange(event.target.value)} rows={8} placeholder={modeCopy.assignment.placeholder} className="min-h-[14rem] w-full resize-y rounded-[1.5rem] border-0 bg-transparent px-4 py-4 text-base leading-7 text-stone-900 outline-none placeholder:text-stone-400" />
              </label>

              <div className="grid gap-2 px-2 pb-2 sm:grid-cols-2 lg:grid-cols-4">
                <SelectField label="Draft type" value={props.draftType} onChange={props.onDraftTypeChange} options={draftTypes} />
                <SelectField label="Citation" value={props.citationStyle} onChange={props.onCitationStyleChange} options={citationStyles} />
                <SelectField label="Words" value={props.wordCount} onChange={props.onWordCountChange} options={wordCounts} />
                <TextAreaField label="Rubric / marking criteria" value={props.rubric} onChange={props.onRubricChange} placeholder="Optional: paste marking criteria, learning outcomes, grade descriptors, or tutor notes." />
                <TextAreaField label="Extra information" value={props.sources} onChange={props.onSourcesChange} placeholder="Optional: paste source notes, required readings, your draft, tutor instructions, preferred argument, or evidence." />
              </div>

              {props.landingError ? <div className="mx-2 mb-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{props.landingError}</div> : null}

              <div className="flex flex-col gap-3 border-t border-stone-100 px-2 pb-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-stone-500">Generate is unlocked after sign up so your work can be saved.</p>
                <button type="button" onClick={props.onGenerate} className="inline-flex items-center justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800">
                  Generate assignment
                  <span className="ml-2">-&gt;</span>
                </button>
              </div>
            </section>
          </div>

          <aside id="signup" className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-4 shadow-[0_24px_80px_rgba(68,53,35,0.12)] sm:p-5 lg:sticky lg:top-6">
            <div className="mb-5 rounded-3xl bg-stone-950 p-5 text-white">
              <p className="text-sm font-semibold text-stone-200">Create workspace</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Save your generated work</h2>
              <p className="mt-3 text-sm leading-6 text-stone-300">
                Sign up with Google or email to generate the assignment and keep drafts, humanized text, and presentations in cloud history.
              </p>
            </div>
            <AccountPanel {...props.authProps} compact />
          </aside>
        </section>
      </div>
    </main>
  );
}

function ToolComposer(props: {
  assignmentPrompt: string;
  audience: string;
  citationStyle: string;
  deckStyle: string;
  draftType: string;
  error: string;
  humanizerText: string;
  humanizerTone: string;
  loading: boolean;
  mode: Mode;
  pdfUploading: boolean;
  pdfUploadStatus: string;
  powerpointPrompt: string;
  rubric: string;
  slideCount: string;
  sources: string;
  wordCount: string;
  onAssignmentPromptChange: (value: string) => void;
  onAudienceChange: (value: string) => void;
  onCitationStyleChange: (value: string) => void;
  onDeckStyleChange: (value: string) => void;
  onDraftTypeChange: (value: string) => void;
  onHumanizerTextChange: (value: string) => void;
  onHumanizerToneChange: (value: string) => void;
  onModeChange: (mode: Mode) => void;
  onPdfUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onPowerpointPromptChange: (value: string) => void;
  onRubricChange: (value: string) => void;
  onSlideCountChange: (value: string) => void;
  onSourcesChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onWordCountChange: (value: string) => void;
}) {
  const copy = modeCopy[props.mode];

  return (
    <form onSubmit={props.onSubmit} className="rounded-[2rem] border border-stone-200 bg-[#fffdf8] p-3 shadow-[0_24px_80px_rgba(68,53,35,0.10)]">
      <div className="flex flex-wrap gap-2 border-b border-stone-100 px-2 pb-3 pt-1">
        {(["assignment", "humanizer", "powerpoint"] as Mode[]).map((item) => (
          <ModePill key={item} active={props.mode === item} onClick={() => props.onModeChange(item)}>{modeCopy[item].label}</ModePill>
        ))}
      </div>

      {props.mode === "assignment" ? <PdfUploadField onUpload={props.onPdfUpload} uploading={props.pdfUploading} status={props.pdfUploadStatus} /> : null}

      <label className="block px-1 pt-3">
        <span className="sr-only">{copy.label} prompt</span>
        <textarea
          value={props.mode === "assignment" ? props.assignmentPrompt : props.mode === "humanizer" ? props.humanizerText : props.powerpointPrompt}
          onChange={(event) => {
            if (props.mode === "assignment") props.onAssignmentPromptChange(event.target.value);
            if (props.mode === "humanizer") props.onHumanizerTextChange(event.target.value);
            if (props.mode === "powerpoint") props.onPowerpointPromptChange(event.target.value);
          }}
          rows={7}
          placeholder={copy.placeholder}
          className="min-h-[11rem] w-full resize-y rounded-[1.5rem] border-0 bg-transparent px-4 py-4 text-base leading-7 text-stone-900 outline-none placeholder:text-stone-400"
        />
      </label>

      <div className="grid gap-2 px-2 pb-2 sm:grid-cols-2 lg:grid-cols-4">
        {props.mode === "assignment" ? (
          <>
            <SelectField label="Draft type" value={props.draftType} onChange={props.onDraftTypeChange} options={draftTypes} />
            <SelectField label="Citation" value={props.citationStyle} onChange={props.onCitationStyleChange} options={citationStyles} />
            <SelectField label="Words" value={props.wordCount} onChange={props.onWordCountChange} options={wordCounts} />
            <TextAreaField label="Rubric / marking criteria" value={props.rubric} onChange={props.onRubricChange} placeholder="Optional: paste marking criteria, learning outcomes, grade descriptors, or tutor notes." />
            <TextAreaField label="Extra information" value={props.sources} onChange={props.onSourcesChange} placeholder="Optional: paste source notes, required readings, your draft, tutor instructions, preferred argument, or evidence." />
          </>
        ) : null}

        {props.mode === "humanizer" ? (
          <>
            <SelectField label="Tone" value={props.humanizerTone} onChange={props.onHumanizerToneChange} options={humanizerTones} />
            <div className="hidden rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-3 py-2 text-xs text-stone-500 sm:block lg:col-span-3">Paste the original text. The output will only contain the rewritten version.</div>
          </>
        ) : null}

        {props.mode === "powerpoint" ? (
          <>
            <SelectField label="Audience" value={props.audience} onChange={props.onAudienceChange} options={audiences} />
            <SelectField label="Slides" value={props.slideCount} onChange={props.onSlideCountChange} options={slideCounts} />
            <SelectField label="Style" value={props.deckStyle} onChange={props.onDeckStyleChange} options={deckStyles} />
            <div className="hidden rounded-2xl border border-dashed border-stone-200 bg-stone-50/60 px-3 py-2 text-xs text-stone-500 lg:block">Generates an outline first, then exports a `.pptx` deck.</div>
          </>
        ) : null}
      </div>

      {props.error ? <div className="mx-2 mb-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{props.error}</div> : null}

      <div className="flex flex-col gap-3 border-t border-stone-100 px-2 pb-1 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-stone-500">{footerForMode(props.mode)}</p>
        <button type="submit" disabled={props.loading} className="inline-flex items-center justify-center rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60">
          {props.loading ? loadingTextForMode(props.mode) : copy.cta}<span className="ml-2">-&gt;</span>
        </button>
      </div>
    </form>
  );
}

function OutputEditor(props: {
  activeInput: string;
  copied: boolean;
  downloading: boolean;
  loading: boolean;
  mode: Mode;
  output: string;
  outputTitle: string;
  onCopy: () => void;
  onDownloadDocument: () => void;
  onDownloadOutput: () => void;
  onDownloadPowerPoint: () => void;
  onOutputChange: (value: string) => void;
}) {
  return (
    <section className="rounded-[2rem] border border-stone-200 bg-[#fffdf8]/90 p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Editor</p><h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">{props.outputTitle}</h2></div>
        <div className="flex flex-wrap gap-2">
          {props.mode === "powerpoint" ? <button type="button" onClick={props.onDownloadPowerPoint} disabled={props.downloading || (!props.output && !props.activeInput)} className="rounded-full border border-stone-900 bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40">{props.downloading ? "Building PPTX..." : "Download PPTX"}</button> : null}
          {props.mode !== "powerpoint" ? <button type="button" onClick={props.onDownloadDocument} disabled={props.downloading || !props.output} className="rounded-full border border-stone-900 bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40">{props.downloading ? "Building DOCX..." : "Download DOCX"}</button> : null}
          <button type="button" onClick={props.onDownloadOutput} disabled={!props.output} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40">Download text</button>
          <button type="button" onClick={props.onCopy} disabled={!props.output} className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40">{props.copied ? "Copied" : "Copy"}</button>
        </div>
      </div>

      <div className="min-h-[20rem] rounded-[1.5rem] border border-stone-200 bg-white p-5">
        {props.loading ? (
          <div className="flex h-full min-h-[18rem] flex-col items-center justify-center text-center text-stone-500"><div className="mb-4 h-9 w-9 animate-spin rounded-full border-2 border-stone-200 border-t-stone-900" /><p className="font-medium text-stone-800">Creating your result</p><p className="mt-1 text-sm">This usually only takes a moment.</p></div>
        ) : props.output ? (
          <textarea value={props.output} onChange={(event) => props.onOutputChange(event.target.value)} rows={24} spellCheck="true" className="min-h-[30rem] w-full resize-y border-0 bg-transparent font-sans text-sm leading-7 text-stone-800 outline-none" />
        ) : (
          <div className="flex h-full min-h-[18rem] flex-col items-center justify-center text-center text-stone-500"><div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-stone-200 bg-[#fbf7ef] text-xl">AI</div><p className="font-medium text-stone-800">Your output will appear here.</p><p className="mt-2 max-w-sm text-sm">Choose a tool, add your prompt, and review or edit the generated result.</p></div>
        )}
      </div>
    </section>
  );
}

type AccountPanelProps = {
  authMode: AuthMode;
  authStatus: string;
  email: string;
  password: string;
  supabaseReady: boolean;
  syncStatus: string;
  user: User | null;
  authLoading: boolean;
  compact?: boolean;
  onAuthModeChange: (mode: AuthMode) => void;
  onEmailChange: (value: string) => void;
  onGoogleSignIn: () => void;
  onPasswordChange: (value: string) => void;
  onSignOut: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function AccountPanel(props: AccountPanelProps) {
  return (
    <section className={props.compact ? "" : "mt-4 rounded-3xl border border-stone-200 bg-white/55 p-4 shadow-sm"}>
      {!props.compact ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Account</p>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${props.user ? "bg-emerald-50 text-emerald-700" : "bg-stone-100 text-stone-500"}`}>{props.user ? "Synced" : "Locked"}</span>
        </div>
      ) : null}

      {!props.supabaseReady ? (
        <p className="text-xs leading-5 text-stone-500">Add Supabase env vars to enable login and cloud history.</p>
      ) : props.user ? (
        <div className="space-y-3"><div><p className="truncate text-sm font-medium text-stone-800">{props.user.email}</p><p className="mt-1 text-xs leading-5 text-stone-500">{props.syncStatus || "Cloud history is active."}</p></div><button type="button" onClick={props.onSignOut} className="w-full rounded-full border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:bg-stone-50">Sign out</button></div>
      ) : (
        <div className="space-y-3">
          <button type="button" onClick={props.onGoogleSignIn} disabled={props.authLoading} className="flex w-full items-center justify-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-2.5 text-sm font-semibold text-stone-800 transition hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-stone-200 text-xs font-bold">G</span>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 text-xs text-stone-400"><span className="h-px flex-1 bg-stone-200" />or use email<span className="h-px flex-1 bg-stone-200" /></div>

          <form onSubmit={props.onSubmit} className="space-y-2">
            <div className="flex gap-1 rounded-full border border-stone-200 bg-white p-1">
              <button type="button" onClick={() => props.onAuthModeChange("sign-up")} className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold ${props.authMode === "sign-up" ? "bg-stone-950 text-white" : "text-stone-500"}`}>Sign up</button>
              <button type="button" onClick={() => props.onAuthModeChange("sign-in")} className={`flex-1 rounded-full px-2 py-1.5 text-xs font-semibold ${props.authMode === "sign-in" ? "bg-stone-950 text-white" : "text-stone-500"}`}>Sign in</button>
            </div>
            <input type="email" value={props.email} onChange={(event) => props.onEmailChange(event.target.value)} placeholder="Email" className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400" />
            <input type="password" value={props.password} onChange={(event) => props.onPasswordChange(event.target.value)} placeholder="Password" className="w-full rounded-2xl border border-stone-200 bg-white px-3 py-2 text-sm outline-none placeholder:text-stone-400" />
            {props.authStatus ? <p className="text-xs leading-5 text-stone-500">{props.authStatus}</p> : null}
            <button type="submit" disabled={props.authLoading} className="w-full rounded-full bg-stone-950 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60">{props.authLoading ? "Working..." : props.authMode === "sign-in" ? "Sign in" : "Create free account"}</button>
          </form>
        </div>
      )}
    </section>
  );
}

function LogoBlock() {
  return <div className="flex items-center gap-2"><div className="flex h-8 w-8 items-center justify-center rounded-xl border border-stone-300 bg-stone-950 text-sm font-semibold text-white shadow-sm">AI</div><div><p className="text-sm font-semibold tracking-tight text-stone-950">AssignAI</p><p className="hidden text-xs text-stone-500 sm:block">Writing and presentation studio</p></div></div>;
}

function inputErrorForMode(mode: Mode): string {
  if (mode === "assignment") return "Paste the assignment brief or describe what you need to write.";
  if (mode === "humanizer") return "Paste text to humanize.";
  return "Describe the presentation you want created.";
}

function footerForMode(mode: Mode): string {
  if (mode === "assignment") return "Assignment Writer analyzes the brief, plans sections, writes them, then humanizes the final draft.";
  if (mode === "humanizer") return "Humanizer rewrites pasted text and returns only the improved version.";
  return "PowerPoint Creator builds a slide outline first, then exports a `.pptx` deck.";
}

function loadingTextForMode(mode: Mode): string {
  if (mode === "assignment") return "Analyzing and writing...";
  if (mode === "humanizer") return "Humanizing text...";
  return "Creating slides...";
}

function SidebarButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex min-w-max items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm transition lg:w-full ${active ? "border-stone-200 bg-white text-stone-950 shadow-sm" : "border-transparent text-stone-600 hover:bg-white/75 hover:text-stone-950"}`}><span className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-100 text-xs font-bold">{icon}</span><span className="font-medium">{label}</span></button>;
}

function PdfUploadField({ onUpload, uploading, status }: { onUpload: (event: ChangeEvent<HTMLInputElement>) => void; uploading: boolean; status: string }) {
  return (
    <div className="mx-2 mt-2 rounded-2xl border border-dashed border-stone-200 bg-white/75 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-stone-800">Upload assignment brief PDF</p>
          <p className="mt-1 text-xs leading-5 text-stone-500">Text-based PDFs are added into the brief box automatically.</p>
        </div>
        <label className={`inline-flex cursor-pointer items-center justify-center rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
          {uploading ? "Reading PDF..." : "Choose PDF"}
          <input type="file" accept="application/pdf,.pdf" onChange={onUpload} disabled={uploading} className="sr-only" />
        </label>
      </div>
      {status ? <p className="mt-2 text-xs leading-5 text-stone-500">{status}</p> : null}
    </div>
  );
}

function ModePill({ active, children, onClick }: { active: boolean; children: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-stone-900 bg-stone-950 text-white" : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-950"}`}>{children}</button>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="block rounded-2xl border border-stone-200 bg-white px-3 py-2 shadow-sm"><span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full appearance-none bg-transparent text-sm font-medium text-stone-800 outline-none">{options.map((option) => <option key={option} value={option} className="bg-white text-stone-900">{option}</option>)}</select></label>;
}

function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="block rounded-2xl border border-stone-200 bg-white px-3 py-2 shadow-sm lg:col-span-2"><span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} placeholder={placeholder} className="mt-2 w-full resize-y border-0 bg-transparent text-sm leading-6 text-stone-800 outline-none placeholder:text-stone-400" /></label>;
}

function HistoryButton({ entry, onClick }: { entry: HistoryEntry; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="w-full rounded-2xl border border-stone-200 bg-white/70 p-3 text-left transition hover:border-stone-300 hover:bg-white"><span className="block truncate text-sm font-medium text-stone-700">{entry.title}</span><span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">{modeCopy[entry.mode].label}</span><span className="mt-1 block text-xs leading-5 text-stone-500">{entry.preview}</span></button>;
}

function HistoryItem({ title, meta }: { title: string; meta: string }) {
  return <div className="rounded-2xl border border-stone-200 bg-white/70 p-3"><p className="truncate text-sm font-medium text-stone-700">{title}</p><p className="mt-1 text-xs leading-5 text-stone-500">{meta}</p></div>;
}
