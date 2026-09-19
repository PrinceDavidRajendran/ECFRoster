"use client";

import { useEffect, useState } from "react";
import { CAPABILITY_LABELS, type CapabilityKey, type Person } from "@/lib/types";

const CAPS = Object.keys(CAPABILITY_LABELS) as CapabilityKey[];

export default function PeopleManager() {
  const [people, setPeople] = useState<Person[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const [addName, setAddName] = useState("");
  const [addCaps, setAddCaps] = useState<Set<CapabilityKey>>(new Set());

  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCaps, setEditCaps] = useState<Set<CapabilityKey>>(new Set());
  const [editActive, setEditActive] = useState(true);
  const [editAwayFrom, setEditAwayFrom] = useState("");
  const [editAwayTo, setEditAwayTo] = useState("");
  const [editAwayNote, setEditAwayNote] = useState("");

  async function load() {
    const res = await fetch("/api/people");
    if (res.ok) { const d = await res.json(); setPeople(d.people || []); }
  }
  useEffect(() => { load(); }, []);

  const filtered = filter.trim()
    ? people.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()))
    : people;

  async function add() {
    setError(null); setBusy(true);
    const res = await fetch("/api/people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: addName, capabilities: [...addCaps] }),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error); setBusy(false); return; }
    setAddName(""); setAddCaps(new Set()); setShowAdd(false);
    setBusy(false); load();
  }

  async function save() {
    if (!editId) return;
    setError(null); setBusy(true);
    const awayDates = editAwayFrom
      ? [{ from: editAwayFrom, to: editAwayTo || undefined, note: editAwayNote || undefined }]
      : [];
    const res = await fetch("/api/people", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ _id: editId, name: editName, capabilities: [...editCaps], active: editActive, awayDates }),
    });
    if (!res.ok) { const d = await res.json(); setError(d.error); setBusy(false); return; }
    setEditId(null); setBusy(false); load();
  }

  async function del(id: string) {
    if (!confirm("Delete this person?")) return;
    const res = await fetch(`/api/people?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) load();
    else { const d = await res.json(); setError(d.error); }
  }

  function toggleCap(set: Set<CapabilityKey>, cap: CapabilityKey): Set<CapabilityKey> {
    const s = new Set(set);
    if (s.has(cap)) s.delete(cap); else s.add(cap);
    return s;
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="flex gap-3 items-end">
        <div className="flex-1"><label className="label">Search</label><input className="input" placeholder="Filter by name…" value={filter} onChange={e => setFilter(e.target.value)} /></div>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>{showAdd ? "Cancel" : "+ Add person"}</button>
      </div>

      {showAdd && (
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold">New person</h2>
          <div><label className="label">Name</label><input className="input w-64" value={addName} onChange={e => setAddName(e.target.value)} /></div>
          <div><label className="label">Capabilities</label>
            <div className="flex flex-wrap gap-1">
              {CAPS.map(c => (
                <button key={c} type="button" className={`badge cursor-pointer ${addCaps.has(c) ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-700"}`} onClick={() => setAddCaps(toggleCap(addCaps, c))}>{CAPABILITY_LABELS[c]}</button>
              ))}
            </div>
          </div>
          <button className="btn-primary" disabled={busy || !addName} onClick={add}>{busy ? "Saving…" : "Add"}</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="py-2 px-3">Name</th><th className="py-2 px-3">Active</th><th className="py-2 px-3">Capabilities</th><th className="py-2 px-3">Away</th><th className="py-2 px-3"></th>
          </tr></thead>
          <tbody>
            {filtered.map(p => (
              <tr key={String(p._id)} className="border-b last:border-0">
                {editId === String(p._id) ? (
                  <>
                    <td className="py-2 px-3"><input className="input w-40" value={editName} onChange={e => setEditName(e.target.value)} /></td>
                    <td className="py-2 px-3"><input type="checkbox" checked={editActive} onChange={e => setEditActive(e.target.checked)} /></td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {CAPS.map(c => (
                          <button key={c} type="button" className={`badge cursor-pointer ${editCaps.has(c) ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-700"}`} onClick={() => setEditCaps(toggleCap(editCaps, c))}>{CAPABILITY_LABELS[c]}</button>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 px-3 space-y-1">
                      <input className="input w-32" type="date" value={editAwayFrom} onChange={e => setEditAwayFrom(e.target.value)} />
                      <input className="input w-32" type="date" value={editAwayTo} onChange={e => setEditAwayTo(e.target.value)} />
                      <input className="input w-40" placeholder="Note" value={editAwayNote} onChange={e => setEditAwayNote(e.target.value)} />
                    </td>
                    <td className="py-2 px-3 space-x-2">
                      <button className="btn-primary" disabled={busy} onClick={save}>Save</button>
                      <button className="btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-2 px-3 font-medium">{p.name}</td>
                    <td className="py-2 px-3">{p.active ? "✓" : "✗"}</td>
                    <td className="py-2 px-3">
                      <div className="flex flex-wrap gap-1">
                        {p.capabilities.map(c => <span key={c} className="badge bg-gray-100 text-gray-700">{CAPABILITY_LABELS[c]}</span>)}
                      </div>
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-500">
                      {p.awayDates?.length ? p.awayDates.map(a => `${a.from}${a.to ? ` → ${a.to}` : ""}${a.note ? ` (${a.note})` : ""}`).join("; ") : "—"}
                    </td>
                    <td className="py-2 px-3 text-right space-x-2">
                      <button className="btn-ghost text-xs" onClick={() => { setEditId(String(p._id)); setEditName(p.name); setEditCaps(new Set(p.capabilities)); setEditActive(p.active); const a = p.awayDates?.[0]; setEditAwayFrom(a?.from || ""); setEditAwayTo(a?.to || ""); setEditAwayNote(a?.note || ""); }}>Edit</button>
                      <button className="btn-ghost text-xs text-red-600" onClick={() => del(String(p._id))}>Delete</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
