"use client";

import { useEffect, useState } from "react";
import { ROLE_LABELS, type Role, type SafeUser } from "@/lib/types";

export default function UsersManager() {
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Add form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("worship");

  // Edit form
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<Role>("worship");
  const [editPw, setEditPw] = useState("");

  // Password-reset links (admin generates a 1-hour single-use link to share).
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetFor, setResetFor] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users || []);
    }
  }

  useEffect(() => { load(); }, []);

  async function add() {
    setError(null); setBusy(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    if (!res.ok) {
      const d = await res.json(); setError(d.error); setBusy(false); return;
    }
    setName(""); setEmail(""); setPassword(""); setShowAdd(false);
    setBusy(false); load();
  }

  async function save() {
    if (!editId) return;
    setError(null); setBusy(true);
    const body: Record<string, unknown> = { _id: editId, name: editName, email: editEmail, role: editRole };
    if (editPw) body.password = editPw;
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json(); setError(d.error); setBusy(false); return;
    }
    setEditId(null); setEditPw(""); setBusy(false); load();
  }

  async function del(id: string) {
    if (!confirm("Delete this user?")) return;
    const res = await fetch(`/api/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (res.ok) load();
    else { const d = await res.json(); setError(d.error); }
  }

  async function makeResetLink(email: string) {
    setError(null); setBusy(true); setResetLink(null); setResetFor(email);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || !d.resetLink) {
      setError(d.error || "Could not create reset link.");
      return;
    }
    setResetLink(d.resetLink as string);
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-700">{error}</p>}

      {resetLink && (
        <div className="card p-4 space-y-2 border-green-200 bg-green-50">
          <p className="text-sm font-medium text-green-900">
            One-time reset link for {resetFor} (expires in 1 hour, single use):
          </p>
          <p className="text-xs break-all font-mono bg-white rounded border p-2">{resetLink}</p>
          <div className="flex gap-2">
            <button
              className="btn-primary text-xs"
              onClick={() => { navigator.clipboard?.writeText(resetLink).catch(() => undefined); }}
            >
              Copy link
            </button>
            <button className="btn-ghost text-xs" onClick={() => { setResetLink(null); setResetFor(null); }}>
              Dismiss
            </button>
          </div>
          <p className="text-xs text-green-800">
            Share this privately with the user (WhatsApp / Telegram / in person).
          </p>
        </div>
      )}

      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Cancel" : "+ Add user"}
        </button>
      </div>

      {showAdd && (
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold">New user</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Name</label><input className="input" value={name} onChange={e => setName(e.target.value)} /></div>
            <div><label className="label">Email</label><input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
            <div><label className="label">Password</label><input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} /></div>
            <div><label className="label">Role</label>
              <select className="input" value={role} onChange={e => setRole(e.target.value as Role)}>
                {(["admin", "worship"] as Role[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          <button className="btn-primary" disabled={busy || !name || !email || password.length < 8} onClick={add}>
            {busy ? "Saving…" : "Create user"}
          </button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead><tr className="text-left text-gray-500 border-b">
          <th className="py-2">Name</th><th className="py-2">Email</th><th className="py-2">Role</th><th className="py-2"></th>
        </tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={String(u._id)} className="border-b last:border-0">
              {editId === String(u._id) ? (
                <>
                  <td className="py-2"><input className="input" value={editName} onChange={e => setEditName(e.target.value)} /></td>
                  <td className="py-2"><input className="input" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} /></td>
                  <td className="py-2"><select className="input" value={editRole} onChange={e => setEditRole(e.target.value as Role)}>
                    {(["admin", "worship"] as Role[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select></td>
                  <td className="py-2 space-x-2">
                    <input className="input w-32" placeholder="New pw (optional)" type="password" value={editPw} onChange={e => setEditPw(e.target.value)} />
                    <button className="btn-primary" disabled={busy} onClick={save}>Save</button>
                    <button className="btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-2 font-medium">{u.name}</td>
                  <td className="py-2 text-gray-600">{u.email}</td>
                  <td className="py-2">{ROLE_LABELS[u.role]}</td>
                  <td className="py-2 text-right space-x-2">
                    <button className="btn-ghost text-xs" onClick={() => { setEditId(String(u._id)); setEditName(u.name); setEditEmail(u.email); setEditRole(u.role); setEditPw(""); }}>Edit</button>
                    <button className="btn-ghost text-xs" disabled={busy} onClick={() => makeResetLink(u.email)}>Reset link</button>
                    <button className="btn-ghost text-xs text-red-600" onClick={() => del(String(u._id))}>Delete</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
