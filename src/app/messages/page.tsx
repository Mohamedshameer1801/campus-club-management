"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Plus, Send } from "lucide-react";
import { api, errMsg, fmtDate, toast } from "@/lib/client";
import { btn, Empty, ErrorBox, Field, inputCls, Modal, PageHeader, Spinner } from "@/components/ui";
export default function MessagesPage() {
  const [me, setMe] = useState<any>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [conv, setConv] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [f, setF] = useState<any>({ subject: "", recipientIds: [] as number[], contextType: "general", eventId: "", body: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const [m, t] = await Promise.all([api("/api/auth/me"), api("/api/messages/threads")]);
      setMe(m.user);
      setThreads(t.threads);
      setActive((cur) => cur ?? Number(new URLSearchParams(window.location.search).get("thread")) ?? null);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadConv = useCallback(async (id: number) => {
    try {
      setConv(await api(`/api/messages/threads/${id}`));
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => { loadThreads(); const t = setInterval(loadThreads, 15000); return () => clearInterval(t); }, [loadThreads]);
  useEffect(() => { if (active) { loadConv(active); const t = setInterval(() => loadConv(active), 10000); return () => clearInterval(t); } }, [active, loadConv]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [conv]);

  const openNew = async () => {
    setOpen(true);
    setFormError(null);
    try {
      const [c, ev] = await Promise.all([api("/api/messages/contacts"), api("/api/events")]);
      setContacts(c.contacts);
      setEvents(ev.events);
    } catch (e) {
      setFormError(errMsg(e));
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      const r = await api("/api/messages/threads", { body: { subject: f.subject, recipientIds: f.recipientIds, contextType: f.contextType, eventId: f.contextType === "event" ? Number(f.eventId) : undefined, body: f.body } });
      toast("Conversation started", "success");
      setOpen(false);
      setF({ subject: "", recipientIds: [], contextType: "general", eventId: "", body: "" });
      await loadThreads();
      setActive(r.thread.id);
    } catch (err) {
      setFormError(errMsg(err));
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !reply.trim()) return;
    try {
      await api(`/api/messages/threads/${active}`, { body: { body: reply } });
      setReply("");
      loadConv(active);
      loadThreads();
    } catch (err) {
      toast(errMsg(err), "error");
    }
  };

  if (loading) return <Spinner />;
  return (
    <div>
      <PageHeader icon={<MessageSquare className="w-6 h-6 text-indigo-400" />} title="Messages" subtitle="Private conversations between faculty members and between faculty and club admins, optionally tied to an event. Only participants can read a thread." actions={me && ["faculty", "club_admin"].includes(me.role) && <button className={btn.primary} onClick={openNew}><Plus className="w-4 h-4" /> New conversation</button>} />
      <ErrorBox message={error} />
      {me && !["faculty", "club_admin"].includes(me.role) ? <Empty title="Messaging is available to faculty and club administrators" /> : (
        <div className="grid md:grid-cols-3 gap-4 min-h-[420px]">
          <ul className="space-y-2 md:max-h-[560px] overflow-y-auto" aria-label="Conversations">
            {threads.length === 0 && <Empty title="No conversations yet" />}
            {threads.map((t) => (
              <li key={t.id}><button onClick={() => setActive(t.id)} aria-current={active === t.id} className={`w-full text-left p-3 rounded-xl border ${active === t.id ? "bg-slate-800 border-indigo-500/60" : "bg-slate-900 border-slate-800 hover:border-slate-700"}`}>
                <div className="flex justify-between gap-2"><b className="text-sm text-white truncate">{t.subject}</b>{t.unread > 0 && <span className="text-[10px] bg-red-600 text-white rounded-full px-1.5">{t.unread}</span>}</div>
                <p className="text-[11px] text-slate-400 truncate">With {t.participants.join(", ")}</p>
                {t.eventTitle && <p className="text-[10px] text-indigo-300 truncate">Event: {t.eventTitle}</p>}
                {t.lastMessage && <p className="text-[11px] text-slate-500 truncate">{t.lastMessage.sender}: {t.lastMessage.body}</p>}
              </button></li>
            ))}
          </ul>
          <section className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col" aria-label="Conversation">
            {!conv || !active ? <div className="flex-1 flex items-center justify-center text-xs text-slate-500 p-10">Select a conversation</div> : (<>
              <div className="p-4 border-b border-slate-800"><b className="text-white text-sm">{conv.thread.subject}</b><p className="text-[11px] text-slate-400">{conv.participants.map((p: any) => p.fullName).join(", ")}{conv.event ? ` - about "${conv.event.title}"` : ""}</p></div>
              <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[380px]" aria-live="polite">
                {conv.messages.map((m: any) => (
                  <div key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-2 text-xs ${m.senderId === me.id ? "ml-auto bg-indigo-600/30 border border-indigo-500/40" : "bg-slate-950 border border-slate-800"}`}>
                    <p className="text-[10px] text-slate-400 mb-0.5">{m.senderName} ({m.senderRole.replace("_", " ")}) - {fmtDate(m.createdAt)}</p><p className="text-slate-100 whitespace-pre-wrap">{m.body}</p>
                  </div>))}
                <div ref={bottom} />
              </div>
              <form onSubmit={send} className="p-3 border-t border-slate-800 flex gap-2"><label htmlFor="reply" className="sr-only">Reply</label><input id="reply" className={inputCls} placeholder="Write a reply..." value={reply} onChange={(e) => setReply(e.target.value)} maxLength={4000} /><button className={btn.primary} aria-label="Send"><Send className="w-4 h-4" /></button></form>
            </>)}
          </section>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="New conversation">
        <form onSubmit={create} className="space-y-3">
          <ErrorBox message={formError} />
          <Field label="Subject" htmlFor="ms"><input id="ms" className={inputCls} required minLength={3} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></Field>
          <fieldset><legend className="text-xs font-medium text-slate-300 mb-1">Recipients (faculty / club admins)</legend><div className="max-h-32 overflow-y-auto space-y-1 bg-slate-950 border border-slate-800 rounded-xl p-2">{contacts.map((c) => <label key={c.id} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={f.recipientIds.includes(c.id)} onChange={(e) => setF({ ...f, recipientIds: e.target.checked ? [...f.recipientIds, c.id] : f.recipientIds.filter((x: number) => x !== c.id) })} />{c.fullName} <span className="text-slate-500">({c.role.replace("_", " ")})</span></label>)}</div></fieldset>
          <Field label="Context" htmlFor="mc" hint="Tie the conversation to an event so it stays on topic."><select id="mc" className={inputCls} value={f.contextType} onChange={(e) => setF({ ...f, contextType: e.target.value })}><option value="general">General</option><option value="event">About an event</option></select></Field>
          {f.contextType === "event" && <Field label="Event" htmlFor="me"><select id="me" className={inputCls} required value={f.eventId} onChange={(e) => setF({ ...f, eventId: e.target.value })}><option value="">Select event</option>{events.map((e) => <option key={e.id} value={e.id}>{e.title} ({e.club?.code})</option>)}</select></Field>}
          <Field label="Message" htmlFor="mb"><textarea id="mb" rows={3} className={inputCls} required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
          <button className={`${btn.primary} w-full`} disabled={f.recipientIds.length === 0}>Send</button>
        </form>
      </Modal>
    </div>
  );
}
