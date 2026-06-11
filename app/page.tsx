"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  BarChart3,
  BellRing,
  Bot,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileUp,
  Headphones,
  LogOut,
  MessageSquareText,
  PhoneCall,
  Play,
  Search,
  Settings,
  ShieldCheck,
  UploadCloud,
  Users
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { defaultCampaign } from "@/lib/campaign-defaults";
import type { Candidate, CandidateStatus } from "@/lib/types";

type ImportedCandidate = Omit<Candidate, "id">;
type ImportRow = Record<string, string | number | boolean | null | undefined>;
type AuthMode = "login" | "register";
type ActiveSection = "Dashboard" | "Candidates" | "Calling" | "WhatsApp" | "Reminders" | "Settings";
type Workspace = {
  user: { id: string; name: string; email: string; role: string };
  company: { id: string; name: string };
};

const statusStyles: Record<CandidateStatus, "default" | "secondary" | "outline" | "warning" | "danger"> = {
  New: "secondary",
  Queued: "outline",
  Calling: "warning",
  Interested: "default",
  Callback: "warning",
  "Not interested": "danger",
  "Interview scheduled": "default",
  Joined: "default",
  Dropped: "danger"
};

const pipelineColumns: CandidateStatus[] = ["Queued", "Interested", "Callback", "Interview scheduled", "Joined"];
const navItems: Array<[ActiveSection, typeof BarChart3]> = [
  ["Dashboard", BarChart3],
  ["Candidates", Users],
  ["Calling", PhoneCall],
  ["WhatsApp", MessageSquareText],
  ["Reminders", BellRing],
  ["Settings", Settings]
];

export default function Home() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    companyName: ""
  });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [query, setQuery] = useState("");
  const [campaign, setCampaign] = useState(defaultCampaign);
  const [jdMessage, setJdMessage] = useState(
    "Hi {{name}}, thanks for your interest in the {{role}} role at {{location}}. Salary is {{salary}}. Reply YES to confirm interview availability."
  );
  const [queueStatus, setQueueStatus] = useState("Ready to start the next call batch.");
  const [dataMode, setDataMode] = useState<"loading" | "database">("loading");
  const [activeSection, setActiveSection] = useState<ActiveSection>("Dashboard");

  useEffect(() => {
    loadWorkspace();
  }, []);

  async function loadWorkspace() {
    setAuthLoading(true);
    try {
      const response = await fetch("/api/auth/me");
      const data = await response.json();
      if (!response.ok || !data.user || !data.company) {
        setWorkspace(null);
        return;
      }

      setWorkspace({ user: data.user, company: data.company });
      await loadCandidates();
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadCandidates() {
    try {
      const response = await fetch("/api/candidates");
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.candidates)) {
        setCandidates([]);
        setQueueStatus(data.error ?? "Could not load workspace candidates.");
        return;
      }
      setCandidates(data.candidates);
      setDataMode(data.mode ?? "database");
    } catch {
      setQueueStatus("Could not reach the candidate API.");
    }
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");

    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const payload =
      authMode === "login"
        ? { email: authForm.email, password: authForm.password }
        : authForm;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();

    if (!response.ok) {
      setAuthError(data.error ?? "Authentication failed.");
      return;
    }

    setWorkspace({ user: data.user, company: data.company });
    setAuthForm({ name: "", email: "", password: "", companyName: "" });
    await loadCandidates();
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setWorkspace(null);
    setCandidates([]);
    setDataMode("loading");
  }

  const filteredCandidates = useMemo(() => {
    return candidates.filter((candidate) => {
      const searchable = `${candidate.name} ${candidate.phone} ${candidate.role} ${candidate.location} ${candidate.status}`.toLowerCase();
      return searchable.includes(query.toLowerCase());
    });
  }, [candidates, query]);

  const metrics = useMemo(() => {
    const total = candidates.length;
    const interested = candidates.filter((candidate) => candidate.status === "Interested").length;
    const scheduled = candidates.filter((candidate) => candidate.status === "Interview scheduled").length;
    const callbacks = candidates.filter((candidate) => candidate.status === "Callback").length;
    return { total, interested, scheduled, callbacks };
  }, [candidates]);

  async function importCandidates(rows: ImportRow[], source: "CSV" | "Excel") {
    const parsed = rows
      .map((row) => mapImportRow(row, campaign, source))
      .filter((candidate): candidate is ImportedCandidate => Boolean(candidate));

    if (parsed.length === 0) {
      setQueueStatus("No valid candidates found. File must include at least name and phone/mobile columns.");
      return;
    }

    try {
      const response = await fetch("/api/candidates/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: parsed })
      });
      const data = await response.json();

      if (!response.ok || !Array.isArray(data.candidates)) {
        setQueueStatus(data.error ?? "Import failed. Check that every row has a valid name and phone number.");
        return;
      }

      setCandidates((current) => [...data.candidates, ...current]);
      setDataMode(data.mode ?? dataMode);
      setQueueStatus(`${data.candidates.length} candidates imported from ${source} into ${workspace?.company.name}.`);
    } catch {
      setQueueStatus("Import failed because the candidate API could not be reached.");
    }
  }

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "csv") {
      Papa.parse<ImportRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => importCandidates(result.data, "CSV"),
        error: () => setQueueStatus("Could not read the CSV file.")
      });
      event.target.value = "";
      return;
    }

    if (extension === "xls" || extension === "xlsx") {
      const reader = new FileReader();
      reader.onload = async (loadEvent) => {
        try {
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(loadEvent.target?.result, { type: "array" });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json<ImportRow>(firstSheet, {
            defval: "",
            raw: false
          });
          importCandidates(rows, "Excel");
        } catch {
          setQueueStatus("Could not read the Excel file.");
        }
      };
      reader.onerror = () => setQueueStatus("Could not read the Excel file.");
      reader.readAsArrayBuffer(file);
      event.target.value = "";
      return;
    }

    setQueueStatus("Unsupported file type. Upload a CSV, XLS, or XLSX file.");
    event.target.value = "";
  }

  async function startCalling() {
    const queuedIds = candidates
      .filter((candidate) => candidate.status === "Queued" || candidate.status === "New")
      .map((candidate) => candidate.id);

    setCandidates((current) =>
      current.map((candidate) =>
        queuedIds.includes(candidate.id)
          ? { ...candidate, status: "Calling", lastTouch: "AI call queued", nextAction: "Waiting for call result" }
          : candidate
      )
    );

    const response = await fetch("/api/campaigns/start-calling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateIds: queuedIds, campaign })
    });
    const data = await response.json();
    setQueueStatus(
      response.ok
        ? data.message ?? `${data.placedCalls ?? 0} Twilio calls started for ${workspace?.company.name}.`
        : data.error ?? "Could not queue campaign."
    );
    setDataMode(data.mode ?? dataMode);
  }

  async function markInterested(candidateId: string) {
    const update = {
      status: "Interested",
      score: 82,
      lastTouch: "Qualified by recruiter",
      nextAction: "Send JD on WhatsApp"
    };

    const response = await fetch(`/api/candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update)
    });
    const data = await response.json();

    if (!response.ok) {
      setQueueStatus(data.error ?? "Could not update candidate.");
      return;
    }

    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId
          ? {
              ...candidate,
              ...update,
              ...(data.mode === "database" ? data.candidate : {})
            }
          : candidate
      )
    );
    setDataMode(data.mode ?? dataMode);
  }

  async function sendWhatsapp(candidateId: string) {
    const response = await fetch("/api/whatsapp/reminder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId, template: jdMessage })
    });
    const data = await response.json();

    if (!response.ok) {
      setQueueStatus(data.error ?? "Could not schedule WhatsApp message.");
      return;
    }

    setCandidates((current) =>
      current.map((candidate) =>
        candidate.id === candidateId
          ? { ...candidate, lastTouch: "WhatsApp JD scheduled", nextAction: "Wait for confirmation" }
          : candidate
      )
    );
  }

  if (authLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
        <Card className="w-[320px]">
          <CardContent className="flex items-center gap-3 p-5">
            <Bot className="h-5 w-5 text-primary" />
            <p className="text-sm text-muted-foreground">Loading Rekroo workspace...</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!workspace) {
    return (
      <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.22),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.16),_transparent_26%),linear-gradient(135deg,_#020617_0%,_#0f172a_48%,_#111827_100%)] p-4 text-slate-100">
        <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-6xl items-center">
          <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_420px] lg:items-center">
            <section className="rounded-lg border border-white/10 bg-white/[0.06] p-6 shadow-soft backdrop-blur-xl md:p-8">
              <div className="mb-7 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-bold">Rekroo</p>
                  <p className="text-sm text-muted-foreground">AI recruitment workspace</p>
                </div>
              </div>
              <h1 className="max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">
                Run candidate calling, CRM, and follow-ups inside one company workspace.
              </h1>
              <div className="mt-8 grid gap-3 md:grid-cols-3">
                <GlassPoint icon={ShieldCheck} title="Private teams" text="Every company gets isolated candidates and campaigns." />
                <GlassPoint icon={PhoneCall} title="Calling queue" text="Recruiters can upload files and queue AI calls." />
                <GlassPoint icon={MessageSquareText} title="Follow-up desk" text="WhatsApp actions are tracked against each candidate." />
              </div>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>{authMode === "login" ? "Log in" : "Create workspace"}</CardTitle>
                <CardDescription>
                  {authMode === "login" ? "Open your company recruitment desk." : "Create the first owner account for your team."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={submitAuth}>
                  {authMode === "register" ? (
                    <>
                      <Field label="Your name" value={authForm.name} onChange={(value) => setAuthForm({ ...authForm, name: value })} />
                      <Field label="Company name" value={authForm.companyName} onChange={(value) => setAuthForm({ ...authForm, companyName: value })} />
                    </>
                  ) : null}
                  <Field label="Email" value={authForm.email} onChange={(value) => setAuthForm({ ...authForm, email: value })} />
                  <div className="space-y-2">
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={authForm.password}
                      onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })}
                    />
                  </div>
                  {authError ? <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-red-200">{authError}</p> : null}
                  <Button className="w-full" type="submit">
                    {authMode === "login" ? "Log in" : "Create workspace"}
                  </Button>
                  <Button
                    className="w-full"
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setAuthError("");
                      setAuthMode(authMode === "login" ? "register" : "login");
                    }}
                  >
                    {authMode === "login" ? "Create a new company workspace" : "Use an existing account"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.20),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.13),_transparent_25%),linear-gradient(135deg,_#020617_0%,_#0f172a_52%,_#111827_100%)] text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-white/[0.06] p-5 backdrop-blur-xl lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold">Rekroo</p>
              <p className="text-xs text-muted-foreground">AI recruitment desk</p>
            </div>
          </div>
          <div className="mb-6 rounded-lg border border-white/10 bg-white/[0.06] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Building2 className="h-4 w-4 text-primary" />
              {workspace.company.name}
            </div>
            <p className="text-xs text-muted-foreground">{workspace.user.name} · {workspace.user.role}</p>
            <p className="mt-1 text-xs text-muted-foreground">{workspace.user.email}</p>
          </div>
          <nav className="space-y-1 text-sm">
            {navItems.map(([item, Icon]) => (
              <button
                key={item as string}
                onClick={() => setActiveSection(item)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left font-medium transition ${
                  activeSection === item
                    ? "border border-white/10 bg-primary/20 text-white shadow-lg shadow-primary/10"
                    : "text-slate-200 hover:bg-white/[0.08]"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item as string}
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex-1 p-4 md:p-6 lg:p-8">
          <header className="mb-6 rounded-lg border border-white/10 bg-white/[0.06] p-5 shadow-soft backdrop-blur-xl">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                  <Headphones className="h-4 w-4" />
                  {workspace.company.name} · {dataMode === "database" ? "PostgreSQL connected" : "Loading data"}
                </div>
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">AI calling CRM for bulk hiring</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Upload candidates, run screening calls, qualify leads, and trigger WhatsApp follow-ups inside this team workspace.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <UploadCloud className="mr-2 h-4 w-4" />
                      Import file
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload candidates</DialogTitle>
                      <DialogDescription>
                        CSV, XLS, and XLSX are supported. Use columns like name, phone/mobile, role, location, salary, experience.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.05] p-5">
                      <Label htmlFor="candidate-upload" className="mb-3 flex items-center gap-2">
                        <FileUp className="h-4 w-4" />
                        Candidate file
                      </Label>
                      <Input id="candidate-upload" type="file" accept=".csv,.xls,.xlsx" onChange={handleFileUpload} />
                    </div>
                  </DialogContent>
                </Dialog>
                <Button onClick={startCalling}>
                  <Play className="mr-2 h-4 w-4" />
                  Start calling
                </Button>
                <Button variant="ghost" size="icon" onClick={logout} title="Log out">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          {activeSection === "Dashboard" ? (
            <section className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="Total candidates" value={metrics.total} icon={Users} />
                <MetricCard title="Interested" value={metrics.interested} icon={CheckCircle2} />
                <MetricCard title="Callbacks" value={metrics.callbacks} icon={CalendarClock} />
                <MetricCard title="Interviews" value={metrics.scheduled} icon={BellRing} />
              </div>
              <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                <Card>
                  <CardHeader>
                    <CardTitle>Pipeline overview</CardTitle>
                    <CardDescription>Live hiring movement inside {workspace.company.name}.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-5">
                      {pipelineColumns.map((status) => (
                        <button
                          key={status}
                          onClick={() => setActiveSection("Candidates")}
                          className="rounded-lg border border-white/10 bg-white/[0.05] p-4 text-left hover:bg-white/[0.09]"
                        >
                          <p className="text-xs text-muted-foreground">{status}</p>
                          <p className="mt-2 text-2xl font-bold">{candidates.filter((candidate) => candidate.status === status).length}</p>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Workspace health</CardTitle>
                    <CardDescription>{queueStatus}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <QueueStat label="Database" value={dataMode === "database" ? "Connected" : "Waiting"} />
                    <QueueStat label="Team" value={workspace.company.name} />
                    <QueueStat label="Active user" value={workspace.user.name} />
                  </CardContent>
                </Card>
              </div>
            </section>
          ) : null}

          {activeSection === "Candidates" ? (
            <section className="space-y-4">
              <Card>
                <CardHeader className="gap-3 md:flex-row md:items-center md:justify-between md:space-y-0">
                  <div>
                    <CardTitle>Candidate CRM</CardTitle>
                    <CardDescription>{workspace.company.name} private candidate database.</CardDescription>
                  </div>
                  <div className="flex min-w-full items-center gap-2 md:min-w-80">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search candidates" />
                  </div>
                </CardHeader>
                <CardContent>
                  <CandidateTable
                    candidates={filteredCandidates}
                    markInterested={markInterested}
                    sendWhatsapp={sendWhatsapp}
                  />
                </CardContent>
              </Card>
            </section>
          ) : null}

          {activeSection === "Calling" ? (
            <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <Card>
                <CardHeader>
                  <CardTitle>Job campaign setup</CardTitle>
                  <CardDescription>These fields become the AI recruiter call context.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <Field label="Role" value={campaign.role} onChange={(value) => setCampaign({ ...campaign, role: value })} />
                  <Field label="Location" value={campaign.location} onChange={(value) => setCampaign({ ...campaign, location: value })} />
                  <Field label="Salary" value={campaign.salary} onChange={(value) => setCampaign({ ...campaign, salary: value })} />
                  <Field label="Shift" value={campaign.shift} onChange={(value) => setCampaign({ ...campaign, shift: value })} />
                  <Field label="Language" value={campaign.language} onChange={(value) => setCampaign({ ...campaign, language: value })} />
                  <Button onClick={startCalling}>
                    <Play className="mr-2 h-4 w-4" />
                    Queue AI calls
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Call queue</CardTitle>
                  <CardDescription>{queueStatus}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-white/10 bg-slate-950/70 p-4 text-sm text-slate-100">
                    <div className="mb-3 flex items-center gap-2 text-teal-300">
                      <PhoneCall className="h-4 w-4" />
                      Screening script
                    </div>
                    <p>1. Confirm interest for {campaign.role}</p>
                    <p>2. Check salary expectation</p>
                    <p>3. Ask qualification and experience</p>
                    <p>4. Confirm shift and location</p>
                    <p>5. Classify outcome and next step</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <QueueStat label="Queued" value={candidates.filter((candidate) => candidate.status === "Queued").length} />
                    <QueueStat label="Calling" value={candidates.filter((candidate) => candidate.status === "Calling").length} />
                    <QueueStat label="Provider" value="Twilio" />
                    <QueueStat label="Voice" value="Sarvam" />
                  </div>
                  <div className="space-y-2">
                    {candidates
                      .filter((candidate) => candidate.status === "Queued" || candidate.status === "Calling" || candidate.status === "New")
                      .slice(0, 5)
                      .map((candidate) => (
                        <div key={candidate.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.05] p-3 text-sm">
                          <div>
                            <p className="font-medium">{candidate.name}</p>
                            <p className="text-xs text-muted-foreground">{candidate.phone}</p>
                          </div>
                          <Badge variant={statusStyles[candidate.status]}>{candidate.status}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </section>
          ) : null}

          {activeSection === "WhatsApp" ? (
            <section className="grid gap-4 lg:grid-cols-[420px_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>WhatsApp template</CardTitle>
                  <CardDescription>Used after a candidate is interested or needs reminders.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea value={jdMessage} onChange={(event) => setJdMessage(event.target.value)} />
                  <div className="rounded-lg border border-white/10 bg-white/[0.05] p-4 text-sm">
                    <p className="font-medium">Template variables</p>
                    <p className="mt-1 text-muted-foreground">{"{{name}}, {{role}}, {{location}}, {{salary}}"}</p>
                  </div>
                  <Button variant="outline">
                    <MessageSquareText className="mr-2 h-4 w-4" />
                    Save template
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Ready to message</CardTitle>
                  <CardDescription>Interested and callback candidates can receive follow-ups.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {candidates
                    .filter((candidate) => candidate.status === "Interested" || candidate.status === "Callback")
                    .map((candidate) => (
                      <div key={candidate.id} className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.05] p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-semibold">{candidate.name}</p>
                          <p className="text-sm text-muted-foreground">{candidate.phone} · {candidate.nextAction}</p>
                        </div>
                        <Button size="sm" variant="secondary" onClick={() => sendWhatsapp(candidate.id)}>
                          <MessageSquareText className="mr-2 h-4 w-4" />
                          Send
                        </Button>
                      </div>
                    ))}
                  {candidates.filter((candidate) => candidate.status === "Interested" || candidate.status === "Callback").length === 0 ? (
                    <p className="rounded-lg border border-white/10 bg-white/[0.05] p-6 text-center text-sm text-muted-foreground">
                      No candidates are ready for WhatsApp follow-up yet.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </section>
          ) : null}

          {activeSection === "Reminders" ? (
            <section className="grid gap-4 lg:grid-cols-3">
              <ReminderCard title="Callbacks due" candidates={candidates.filter((candidate) => candidate.status === "Callback")} />
              <ReminderCard title="Interview reminders" candidates={candidates.filter((candidate) => candidate.status === "Interview scheduled")} />
              <ReminderCard title="Joining follow-ups" candidates={candidates.filter((candidate) => candidate.status === "Interested")} />
            </section>
          ) : null}

          {activeSection === "Settings" ? (
            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Workspace settings</CardTitle>
                  <CardDescription>Company and signed-in user details.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Company" value={workspace.company.name} onChange={() => undefined} />
                  <Field label="User" value={workspace.user.name} onChange={() => undefined} />
                  <Field label="Email" value={workspace.user.email} onChange={() => undefined} />
                  <Badge variant="secondary">{workspace.user.role}</Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Integration checklist</CardTitle>
                  <CardDescription>Environment keys required for live automation.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {["DATABASE_URL", "AUTH_SECRET", "APP_BASE_URL", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "SARVAM_API_KEY"].map((item) => (
                    <div key={item} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.05] p-3 text-sm">
                      <span>{item}</span>
                      <Badge variant={item === "DATABASE_URL" || item === "AUTH_SECRET" ? "default" : "outline"}>
                        {item === "DATABASE_URL" || item === "AUTH_SECRET" ? "Active" : "Required"}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function GlassPoint({
  icon: Icon,
  title,
  text
}: {
  icon: typeof ShieldCheck;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
      <Icon className="mb-3 h-5 w-5 text-primary" />
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function CandidateTable({
  candidates,
  markInterested,
  sendWhatsapp
}: {
  candidates: Candidate[];
  markInterested: (candidateId: string) => void;
  sendWhatsapp: (candidateId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <div className="grid grid-cols-[1.3fr_1fr_1fr_1fr_170px] bg-white/[0.07] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground max-lg:hidden">
        <span>Candidate</span>
        <span>Role</span>
        <span>Status</span>
        <span>Next action</span>
        <span>Actions</span>
      </div>
      <div className="divide-y divide-white/10">
        {candidates.map((candidate) => (
          <div
            key={candidate.id}
            className="grid gap-3 px-4 py-4 lg:grid-cols-[1.3fr_1fr_1fr_1fr_170px] lg:items-center"
          >
            <div>
              <p className="font-semibold">{candidate.name}</p>
              <p className="text-sm text-muted-foreground">{candidate.phone}</p>
              <p className="text-xs text-muted-foreground">{candidate.location} · {candidate.language}</p>
            </div>
            <div className="text-sm">
              <p>{candidate.role}</p>
              <p className="text-muted-foreground">{candidate.salary}</p>
            </div>
            <div>
              <Badge variant={statusStyles[candidate.status]}>{candidate.status}</Badge>
              {candidate.score > 0 ? <p className="mt-1 text-xs text-muted-foreground">Fit score {candidate.score}%</p> : null}
            </div>
            <div className="text-sm text-muted-foreground">
              <p>{candidate.nextAction}</p>
              <p className="text-xs">{candidate.lastTouch}</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => markInterested(candidate.id)}>
                Qualify
              </Button>
              <Button size="sm" variant="secondary" onClick={() => sendWhatsapp(candidate.id)}>
                <MessageSquareText className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {candidates.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            No candidates in this view yet.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReminderCard({ title, candidates }: { title: string; candidates: Candidate[] }) {
  return (
    <Card className="min-h-80">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{candidates.length} candidates</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {candidates.map((candidate) => (
          <div key={candidate.id} className="rounded-lg border border-white/10 bg-white/[0.05] p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{candidate.name}</p>
                <p className="text-muted-foreground">{candidate.phone}</p>
              </div>
              <Badge variant={statusStyles[candidate.status]}>{candidate.status}</Badge>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{candidate.nextAction}</p>
          </div>
        ))}
        {candidates.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-white/[0.05] p-6 text-center text-sm text-muted-foreground">
            Nothing due in this lane.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon
}: {
  title: string;
  value: number;
  icon: typeof Users;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-3xl font-bold">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function QueueStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.05] p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function mapImportRow(
  row: ImportRow,
  campaign: typeof defaultCampaign,
  source: "CSV" | "Excel"
): ImportedCandidate | null {
  const name = getRowValue(row, ["name", "candidate name", "full name", "candidate"]);
  const phone = normalizePhone(
    getRowValue(row, ["phone", "mobile", "mobile number", "contact", "contact number", "number"])
  );

  if (!name || !phone) {
    return null;
  }

  return {
    name,
    phone,
    role: getRowValue(row, ["role", "job role", "position", "profile"]) || campaign.role,
    location: getRowValue(row, ["location", "city", "area"]) || campaign.location,
    salary: getRowValue(row, ["salary", "ctc", "expected salary", "package"]) || campaign.salary,
    experience: getRowValue(row, ["experience", "exp", "work experience"]) || "Not captured",
    status: "Queued",
    score: 0,
    lastTouch: `Uploaded from ${source}`,
    nextAction: "AI call pending",
    language: "Hinglish"
  };
}

function getRowValue(row: ImportRow, keys: string[]) {
  const normalizedEntries = Object.entries(row).map(([key, value]) => [
    normalizeKey(key),
    value == null ? "" : String(value).trim()
  ]);

  for (const key of keys) {
    const match = normalizedEntries.find(([rowKey]) => rowKey === normalizeKey(key));
    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizePhone(phone: string) {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }

  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+${cleaned}`;
  }

  return cleaned;
}
