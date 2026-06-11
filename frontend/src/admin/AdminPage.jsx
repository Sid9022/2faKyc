import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileCog,
  LayoutDashboard,
  LogOut,
  Mail,
  Settings,
  Users
} from "lucide-react";
import {
  createAdminRequirement,
  createAdminUser,
  getAdminDashboard,
  getAdminEmailLogs,
  getAdminEntityTypes,
  getAdminSettings,
  getAdminUsers,
  getCurrentUser,
  logout,
  patchAdminSettings,
  updateAdminRequirement,
  updateAdminUser
} from "../api/kycApi";

const TABS = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "requirements", label: "Document config", icon: FileCog },
  { key: "users", label: "Users", icon: Users },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "emails", label: "Email logs", icon: Mail }
];

export default function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("dashboard");
  const user = getCurrentUser();

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200/80 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-bold text-gray-950">Admin console</h1>
            <p className="text-xs text-gray-500">
              Signed in as {user?.fullName} ({user?.email})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/reviewer/cases"
              className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Reviewer view
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </div>

        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-3">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition ${
                tab === item.key
                  ? "bg-gray-950 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === "dashboard" && <DashboardTab />}
        {tab === "requirements" && <RequirementsTab />}
        {tab === "users" && <UsersTab />}
        {tab === "settings" && <SettingsTab />}
        {tab === "emails" && <EmailLogsTab />}
      </main>
    </div>
  );
}

// ---------- Dashboard ----------

function DashboardTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminDashboard()
      .then((result) => setData(result.data || result))
      .catch((err) => setError(err.response?.data?.message || "Failed to load."));
  }, []);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <LoadingNote />;

  const statuses = data.kycByStatus || {};

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Object.entries(statuses).map(([status, count]) => (
          <div key={status} className="rounded-2xl border border-gray-200/80 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
              {status.replaceAll("_", " ")}
            </p>
            <p className="mt-1 text-2xl font-black text-gray-950">{count}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-gray-200/80 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            Emails (failed)
          </p>
          <p className="mt-1 text-2xl font-black text-gray-950">
            {data.emails?.total ?? 0}{" "}
            <span className="text-sm font-semibold text-red-600">
              ({data.emails?.failed ?? 0})
            </span>
          </p>
        </div>
      </div>

      <section className="rounded-[2rem] border border-gray-200/80 bg-white p-5">
        <h2 className="text-sm font-bold text-gray-950">Recent activity</h2>
        <div className="mt-4 space-y-2">
          {(data.recentAudit || []).map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {log.action.replaceAll("_", " ")}
                </p>
                <p className="text-xs text-gray-500">
                  {log.actorType}
                  {log.oldStatus ? ` • ${log.oldStatus} → ${log.newStatus}` : ""}
                </p>
              </div>
              <p className="shrink-0 text-xs text-gray-400">
                {new Date(log.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------- Document requirements ----------

function RequirementsTab() {
  const [entityTypes, setEntityTypes] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    getAdminEntityTypes()
      .then((result) => setEntityTypes(result.data || []))
      .catch((err) => setError(err.response?.data?.message || "Failed to load."));
  }, []);

  useEffect(load, [load]);

  async function toggle(requirement, field) {
    const result = await updateAdminRequirement(requirement.id, {
      [field]: !requirement[field]
    });
    if (result.success) {
      setNotice("Saved. Changes apply to NEW KYC cases only.");
      load();
    }
  }

  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-6">
      {notice && (
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
          {notice}
        </div>
      )}

      {entityTypes.map((entity) => (
        <section
          key={entity.id}
          className="rounded-[2rem] border border-gray-200/80 bg-white p-5"
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-gray-950">{entity.label}</h2>
              <p className="text-xs text-gray-500">
                key: {entity.key} • PAN char: {entity.panChar || "—"}
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                  <th className="py-2 pr-3">Document</th>
                  <th className="py-2 pr-3">Input mode</th>
                  <th className="py-2 pr-3">Required</th>
                  <th className="py-2 pr-3">Active</th>
                  <th className="py-2 pr-3">OCR</th>
                  <th className="py-2">Sort</th>
                </tr>
              </thead>
              <tbody>
                {entity.requirements.map((req) => (
                  <tr key={req.id} className="border-t border-gray-100">
                    <td className="py-2.5 pr-3 font-semibold text-gray-900">
                      {req.documentName}
                      <span className="block text-xs font-normal text-gray-400">
                        {req.documentKey}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600">{req.inputMode}</td>
                    <td className="py-2.5 pr-3">
                      <ToggleButton
                        value={req.isRequired}
                        onClick={() => toggle(req, "isRequired")}
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <ToggleButton
                        value={req.isActive}
                        onClick={() => toggle(req, "isActive")}
                      />
                    </td>
                    <td className="py-2.5 pr-3">
                      <ToggleButton
                        value={req.ocrEnabled}
                        onClick={() => toggle(req, "ocrEnabled")}
                      />
                    </td>
                    <td className="py-2.5 text-gray-600">{req.sortOrder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <NewRequirementForm entityTypeId={entity.id} onCreated={load} />
        </section>
      ))}
    </div>
  );
}

function NewRequirementForm({ entityTypeId, onCreated }) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({
    documentKey: "",
    documentName: "",
    inputMode: "upload",
    isRequired: true,
    sortOrder: 99
  });
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      const result = await createAdminRequirement({
        entityTypeId,
        ...form,
        sortOrder: Number(form.sortOrder)
      });

      if (result.success) {
        setIsOpen(false);
        setForm({ documentKey: "", documentName: "", inputMode: "upload", isRequired: true, sortOrder: 99 });
        onCreated();
      } else {
        setError(result.message || JSON.stringify(result.errors));
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create.");
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-4 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
      >
        + Add document requirement
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 grid gap-3 rounded-2xl bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
      <input
        required
        placeholder="document_key"
        value={form.documentKey}
        onChange={(e) => setForm({ ...form, documentKey: e.target.value })}
        className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />
      <input
        required
        placeholder="Document name"
        value={form.documentName}
        onChange={(e) => setForm({ ...form, documentName: e.target.value })}
        className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />
      <select
        value={form.inputMode}
        onChange={(e) => setForm({ ...form, inputMode: e.target.value })}
        className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
      >
        <option value="upload">upload</option>
        <option value="live_photo_front">live_photo_front</option>
        <option value="live_photo_front_back">live_photo_front_back</option>
        <option value="upload_or_live_photo">upload_or_live_photo</option>
      </select>
      <input
        type="number"
        placeholder="Sort order"
        value={form.sortOrder}
        onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
        className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-xl bg-gray-950 px-4 py-2 text-xs font-semibold text-white"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600"
        >
          Cancel
        </button>
      </div>
      {error && (
        <p className="col-span-full text-xs font-medium text-red-600">{error}</p>
      )}
    </form>
  );
}

// ---------- Users ----------

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ email: "", fullName: "", role: "reviewer", password: "" });
  const [formError, setFormError] = useState("");

  const load = useCallback(() => {
    getAdminUsers()
      .then((result) => setUsers(result.data || []))
      .catch((err) => setError(err.response?.data?.message || "Failed to load."));
  }, []);

  useEffect(load, [load]);

  async function handleCreate(event) {
    event.preventDefault();
    setFormError("");

    try {
      const result = await createAdminUser(form);
      if (result.success) {
        setForm({ email: "", fullName: "", role: "reviewer", password: "" });
        load();
      } else {
        setFormError(result.message || JSON.stringify(result.errors));
      }
    } catch (err) {
      setFormError(err.response?.data?.message || "Failed to create user.");
    }
  }

  async function toggleStatus(user) {
    await updateAdminUser(user.id, {
      status: user.status === "active" ? "disabled" : "active"
    });
    load();
  }

  if (error) return <ErrorNote message={error} />;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-gray-200/80 bg-white p-5">
        <h2 className="text-sm font-bold text-gray-950">Create user</h2>
        <form onSubmit={handleCreate} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            required
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Full name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <option value="reviewer">reviewer</option>
            <option value="admin">admin</option>
          </select>
          <input
            required
            type="password"
            placeholder="Password (min 10 chars)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-xl bg-gray-950 px-4 py-2 text-xs font-semibold text-white"
          >
            Create user
          </button>
          {formError && (
            <p className="col-span-full text-xs font-medium text-red-600">{formError}</p>
          )}
        </form>
      </section>

      <section className="rounded-[2rem] border border-gray-200/80 bg-white p-5">
        <h2 className="text-sm font-bold text-gray-950">Team</h2>
        <div className="mt-4 space-y-2">
          {users.map((user) => (
            <div
              key={user.id}
              className="flex flex-col gap-2 rounded-xl bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {user.fullName}{" "}
                  <span className="ml-1 rounded-full bg-gray-200 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-600">
                    {user.role}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  {user.email} • last login:{" "}
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleString()
                    : "never"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleStatus(user)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
                  user.status === "active"
                    ? "border border-red-200 bg-white text-red-600 hover:bg-red-50"
                    : "border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                {user.status === "active" ? "Disable" : "Enable"}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------- Settings ----------

function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminSettings()
      .then((result) => setSettings(result.data || result))
      .catch((err) => setError(err.response?.data?.message || "Failed to load."));
  }, []);

  async function handleSave(event) {
    event.preventDefault();
    setNotice("");

    const result = await patchAdminSettings({
      max_reminders: Number(settings.max_reminders),
      reminder_interval_hours: Number(settings.reminder_interval_hours)
    });

    if (result.success) setNotice("Settings saved.");
  }

  if (error) return <ErrorNote message={error} />;
  if (!settings) return <LoadingNote />;

  return (
    <section className="max-w-lg rounded-[2rem] border border-gray-200/80 bg-white p-5">
      <h2 className="text-sm font-bold text-gray-950">Reminder settings</h2>

      <form onSubmit={handleSave} className="mt-4 space-y-4">
        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            Max reminders
          </label>
          <input
            type="number"
            min={0}
            max={20}
            value={settings.max_reminders}
            onChange={(e) =>
              setSettings({ ...settings, max_reminders: e.target.value })
            }
            className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            Reminder interval (hours)
          </label>
          <input
            type="number"
            min={1}
            max={336}
            value={settings.reminder_interval_hours}
            onChange={(e) =>
              setSettings({ ...settings, reminder_interval_hours: e.target.value })
            }
            className="mt-1.5 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
          />
        </div>

        {notice && (
          <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">
            {notice}
          </p>
        )}

        <button
          type="submit"
          className="rounded-xl bg-gray-950 px-5 py-2.5 text-xs font-semibold text-white"
        >
          Save settings
        </button>
      </form>
    </section>
  );
}

// ---------- Email logs ----------

function EmailLogsTab() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getAdminEmailLogs({ limit: 100 })
      .then((result) => setLogs(result.data || []))
      .catch((err) => setError(err.response?.data?.message || "Failed to load."));
  }, []);

  if (error) return <ErrorNote message={error} />;

  return (
    <section className="rounded-[2rem] border border-gray-200/80 bg-white p-5">
      <h2 className="text-sm font-bold text-gray-950">Email logs</h2>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
              <th className="py-2 pr-3">Type</th>
              <th className="py-2 pr-3">To</th>
              <th className="py-2 pr-3">Subject</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">When</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-gray-100">
                <td className="py-2.5 pr-3 font-semibold text-gray-900">
                  {log.emailType}
                </td>
                <td className="py-2.5 pr-3 text-gray-600">{log.recipientMasked}</td>
                <td className="max-w-[260px] truncate py-2.5 pr-3 text-gray-600">
                  {log.subject}
                </td>
                <td className="py-2.5 pr-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      log.status === "sent"
                        ? "bg-emerald-50 text-emerald-700"
                        : log.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {log.status}
                  </span>
                </td>
                <td className="py-2.5 text-xs text-gray-400">
                  {new Date(log.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- shared bits ----------

function ToggleButton({ value, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${
        value
          ? "bg-emerald-50 text-emerald-700"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {value ? "Yes" : "No"}
    </button>
  );
}

function LoadingNote() {
  return <p className="text-sm text-gray-500">Loading…</p>;
}

function ErrorNote({ message }) {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      {message}
    </div>
  );
}
