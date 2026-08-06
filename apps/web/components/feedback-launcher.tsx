"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import type { SafeNavigationAction, SupportMessage, SupportStreamEvent } from "@/lib/support/assistant-contracts";
import { createClient } from "@/lib/supabase/client";

const CHAT_KEY = "college-crew-ai-support-chat";
const REOPEN_KEY = "college-crew-ai-support-reopen";

type View = "closed" | "menu" | "signin" | "chat";

export function FeedbackLauncher({ aiEnabled }: { aiEnabled: boolean }) {
  const pathname = usePathname();
  const [view, setView] = useState<View>("closed");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [actions, setActions] = useState<SafeNavigationAction[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const supportHref = useMemo(() => `/support?from=${encodeURIComponent(pathname)}`, [pathname]);
  const mailHref = useMemo(() => {
    const url = typeof window === "undefined" ? pathname : `${window.location.origin}${pathname}`;
    return `mailto:support@thecollegecrew.com?subject=${encodeURIComponent("College Crew support")}&body=${encodeURIComponent(`I need help with this page:\n${url}\n\n`)}`;
  }, [pathname]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(CHAT_KEY);
        if (saved) setMessages(JSON.parse(saved));
        if (aiEnabled && sessionStorage.getItem(REOPEN_KEY) === "1") {
          sessionStorage.removeItem(REOPEN_KEY);
          setView("chat");
        }
      } catch { /* storage may be unavailable */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [aiEnabled]);

  useEffect(() => {
    try { sessionStorage.setItem(CHAT_KEY, JSON.stringify(messages)); } catch { /* storage may be unavailable */ }
  }, [messages]);

  useEffect(() => {
    if (view === "closed") return;
    const timer = requestAnimationFrame(() => (view === "chat" ? inputRef.current : panelRef.current?.querySelector<HTMLElement>("button, a"))?.focus());
    return () => cancelAnimationFrame(timer);
  }, [view]);

  function close() {
    requestVersionRef.current += 1;
    abortRef.current?.abort();
    setBusy(false);
    setView("closed");
    requestAnimationFrame(() => launcherRef.current?.focus());
  }

  async function openAi() {
    const { data } = await createClient().auth.getSession();
    setView(data.session ? "chat" : "signin");
  }

  function onPanelKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab") return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy || content.length > 2_000) return;
    const history = [...messages, { role: "user" as const, content }].slice(-23);
    const requestVersion = ++requestVersionRef.current;
    setMessages([...history, { role: "assistant", content: "" }]);
    setDraft(""); setBusy(true); setError(""); setLiveAnnouncement("College Crew AI is responding.");
    const abort = new AbortController(); abortRef.current = abort;
    try {
      const response = await fetch("/api/support/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourcePath: pathname, messages: history }), signal: abort.signal });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message || "College Crew AI is unavailable right now.");
      }
      if (!response.body) throw new Error("College Crew AI is unavailable right now.");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let responseText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n"); buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
          if (!dataLine) continue;
          const streamEvent = JSON.parse(dataLine.slice(6)) as SupportStreamEvent;
          if (requestVersion !== requestVersionRef.current) return;
          if (streamEvent.type === "meta") setActions(streamEvent.actions);
          if (streamEvent.type === "delta") {
            responseText += streamEvent.text;
            setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: message.content + streamEvent.text } : message));
          }
          if (streamEvent.type === "done") setLiveAnnouncement(`College Crew AI: ${responseText}`);
          if (streamEvent.type === "error") throw new Error(streamEvent.code === "timeout" ? "The AI response took too long. Please try again or contact support." : "The AI response was interrupted. Please try again or contact support.");
        }
      }
    } catch (caught) {
      if (!abort.signal.aborted && requestVersion === requestVersionRef.current) {
        const message = caught instanceof Error ? caught.message : "College Crew AI is unavailable right now.";
        setError(message);
        setLiveAnnouncement(message);
        // When nothing streamed back, roll the whole failed turn out of the
        // transcript — the placeholder *and* the user message that produced it.
        // Leaving the user message stranded makes the next send two user turns
        // in a row, which the API rejects as nonalternating, so every retry
        // failed differently until the chat was cleared.
        setMessages((current) => {
          const last = current.at(-1);
          if (last?.role !== "assistant" || last.content) return current;
          return current.slice(0, -2);
        });
        setDraft((current) => current || content);
      }
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setBusy(false);
        abortRef.current = null;
      }
    }
  }

  if (pathname === "/support" || pathname.startsWith("/admin") || pathname === "/messages" || pathname.startsWith("/messages/")) return null;

  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 flex flex-col items-end sm:inset-x-auto sm:bottom-[max(1rem,env(safe-area-inset-bottom))] sm:right-4" aria-label="Help and support">
      {view !== "closed" ? (
        <div ref={panelRef} onKeyDown={onPanelKeyDown} role="dialog" aria-modal="true" aria-labelledby="help-title" className="mb-0 flex max-h-[min(78dvh,42rem)] w-full flex-col overflow-hidden rounded-t-[1.75rem] border border-viridian/15 bg-shell shadow-2xl shadow-viridian/20 sm:mb-3 sm:w-[25rem] sm:rounded-[1.5rem]">
          <header className="flex items-center justify-between border-b border-viridian/10 px-5 py-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-viridian/60">Support</p><h2 id="help-title" className="font-display text-xl font-semibold text-viridian">{view === "chat" ? "College Crew AI" : "How can we help?"}</h2></div>
            <button type="button" onClick={close} className="rounded-full p-2 text-viridian transition hover:bg-viridian/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-viridian" aria-label="Close help">✕</button>
          </header>

          {view === "menu" ? <div className="space-y-2 p-4">
            {aiEnabled ? <button type="button" onClick={openAi} className="group flex w-full items-start gap-3 rounded-2xl bg-white/70 p-4 text-left transition hover:bg-white focus-visible:outline-2 focus-visible:outline-viridian"><span aria-hidden="true">✦</span><span><strong className="block text-viridian">Ask the College Crew AI</strong><span className="text-sm text-viridian/70">Get quick, read-only guidance about College Crew.</span></span></button> : null}
            <Link href={supportHref} className="flex items-start gap-3 rounded-2xl p-4 text-viridian transition hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-viridian"><span aria-hidden="true">↗</span><span><strong className="block">Submit a ticket</strong><span className="text-sm text-viridian/70">Send details to the College Crew team.</span></span></Link>
            <a href={mailHref} className="flex items-start gap-3 rounded-2xl p-4 text-viridian transition hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-viridian"><span aria-hidden="true">@</span><span><strong className="block">Email support</strong><span className="text-sm text-viridian/70">Open your mail app.</span></span></a>
          </div> : null}

          {view === "signin" ? <div className="space-y-4 p-5 text-sm text-viridian"><p>Please sign in before speaking with the AI assistant. You can still submit a ticket or email us.</p><div className="flex flex-wrap gap-2"><Link href={`/login?next=${encodeURIComponent(pathname)}`} onClick={() => sessionStorage.setItem(REOPEN_KEY, "1")} className="rounded-full bg-viridian px-4 py-2 font-semibold text-shell">Sign in</Link><Link href={supportHref} className="rounded-full border border-viridian/20 px-4 py-2 font-semibold">Submit a ticket</Link><a href={mailHref} className="rounded-full px-4 py-2 font-semibold">Email support</a></div></div> : null}

          {view === "chat" ? <>
            <div className="border-b border-viridian/10 bg-white/45 px-5 py-3 text-xs leading-relaxed text-viridian/70"><strong className="text-viridian">AI assistant.</strong> Don’t share passwords, card details, or identity documents. Chat text and limited verified page/account context go to OpenAI. College Crew does not save this transcript; OpenAI’s standard abuse-monitoring retention may apply.</div>
            <p className="sr-only" aria-live="polite">{liveAnnouncement}</p>
            <div className="min-h-48 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-busy={busy}>
              {messages.length === 0 ? <p className="rounded-2xl bg-white/70 p-4 text-sm leading-relaxed text-viridian">Hi — I’m College Crew AI. I can explain provider setup, bookings, payments, and where to go next. What can I help with?</p> : messages.map((message, index) => <div key={index} className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${message.role === "user" ? "ml-auto bg-viridian text-shell" : "bg-white/80 text-viridian"}`}>{message.content || (busy && index === messages.length - 1 ? "Thinking…" : "")}</div>)}
              {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
              {actions.length ? <nav aria-label="Suggested pages" className="flex flex-wrap gap-2">{actions.map((action) => <Link key={action.key} href={action.href} className="rounded-full border border-viridian/20 bg-white px-3 py-1.5 text-xs font-semibold text-viridian">{action.label}</Link>)}</nav> : null}
            </div>
            <div className="border-t border-viridian/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-4">
              <form onSubmit={send} className="flex items-end gap-2"><textarea ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} maxLength={2000} rows={2} placeholder="Ask a question" aria-label="Message College Crew AI" className="min-h-12 flex-1 resize-none rounded-2xl border border-viridian/20 bg-white px-4 py-3 text-sm text-viridian outline-none focus:border-viridian"/><button type="submit" disabled={busy || !draft.trim()} className="rounded-full bg-viridian px-4 py-3 text-sm font-semibold text-shell disabled:opacity-40">Send</button></form>
              <div className="mt-3 flex items-center justify-between text-xs"><button type="button" onClick={() => { requestVersionRef.current += 1; abortRef.current?.abort(); abortRef.current = null; setBusy(false); setMessages([]); setActions([]); setError(""); setLiveAnnouncement("Chat cleared."); sessionStorage.removeItem(CHAT_KEY); }} className="font-semibold text-viridian/65 underline-offset-2 hover:underline">Clear chat</button><span className="flex gap-3"><Link href={supportHref} className="text-viridian/75 hover:underline">Ticket</Link><a href={mailHref} className="text-viridian/75 hover:underline">Email</a></span></div>
            </div>
          </> : null}
        </div>
      ) : null}
      <button ref={launcherRef} type="button" onClick={() => setView(view === "closed" ? "menu" : "closed")} aria-expanded={view !== "closed"} className="mb-[max(1rem,env(safe-area-inset-bottom))] mr-4 inline-flex items-center gap-2 rounded-full bg-viridian px-4 py-2.5 text-sm font-semibold text-shell shadow-lg shadow-viridian/20 transition motion-reduce:transition-none hover:bg-viridian-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-viridian sm:mb-0 sm:mr-0"><span aria-hidden="true">?</span>Help</button>
    </aside>
  );
}
