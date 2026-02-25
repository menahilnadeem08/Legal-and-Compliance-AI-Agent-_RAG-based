"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppNav } from "@/app/components/AppNav";
import { AddEmployeeModal } from "@/app/admin/AddEmployeeModal";
import {
  UserPlus,
  CheckCircle,
  UserCheck,
  UserX,
  Loader2,
} from "lucide-react";
import { getAuthToken, isEmployeeUser } from "@/app/utils/auth";
import { api } from "@/app/utils/apiClient";
import { parseAsUTC } from "@/app/utils/date";

type Employee = {
  id: number;
  username: string;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {children}
    </div>
  );
}

export default function AddEmployee() {
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    employee: Employee;
    action: "activate" | "deactivate";
  } | null>(null);

  useEffect(() => {
    if (isEmployeeUser()) {
      router.replace("/");
      return;
    }
    if (!getAuthToken()) {
      router.replace("/auth/login");
      return;
    }
  }, [router]);

  const loadEmployees = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ employees?: Employee[] }>("/admin/employees");
      if (response.success && response.data?.employees != null) {
        setEmployees(response.data.employees);
      } else {
        setError(response.message ?? "Failed to load employees.");
        setEmployees([]);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load employees.");
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (getAuthToken() && !isEmployeeUser()) loadEmployees();
  }, []);

  const clearMessages = () => {
    setSuccessMessage(null);
    setError(null);
  };

  const handleConfirmToggle = async () => {
    if (!confirmTarget) return;
    const { employee, action } = confirmTarget;
    setTogglingId(employee.id);
    try {
      const response = await api.put(`/admin/employees/${employee.id}/${action}`);
      if (response.success) {
        setSuccessMessage(
          action === "activate"
            ? `${employee.username} is now active.`
            : `${employee.username} has been deactivated.`
        );
        await loadEmployees();
        setConfirmTarget(null);
      } else {
        setError(response.message ?? `Failed to ${action} employee.`);
        setConfirmTarget(null);
      }
    } catch (err) {
      console.error(err);
      setError("An error occurred.");
      setConfirmTarget(null);
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 dark:text-blue-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white">
      <AppNav />
      <PageContainer>
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Add Employee</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Manage employees and system configuration
          </p>
        </header>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-3 text-sm border border-red-200 dark:border-red-800">
            {error}
          </div>
        )}
        {/* Success / Error message areas */}
        {successMessage && (
          <div
            className="mb-6 flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-emerald-700 dark:text-emerald-300 text-sm"
            role="status"
          >
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}
        {/* Employees table */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Employees</h2>
            <button
              type="button"
              onClick={() => { setAddModalOpen(true); clearMessages(); }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm"
            >
              <UserPlus className="w-4 h-4" />
              Add Employee
            </button>
          </div>
          {employees.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center">
              <p className="text-slate-600 dark:text-slate-400">No employees created yet</p>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                Click &quot;Add Employee&quot; to create an employee.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                      <th className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Username
                      </th>
                      <th className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Email
                      </th>
                      <th className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Name
                      </th>
                      <th className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Status
                      </th>
                      <th className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Created
                      </th>
                      <th className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr
                        key={emp.id}
                        className="border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                          {emp.username}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                          {emp.email}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                          {emp.name || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${
                              emp.is_active
                                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {emp.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                          {emp.created_at
                            ? parseAsUTC(emp.created_at).toLocaleDateString()
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {togglingId === emp.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                          ) : emp.is_active ? (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmTarget({ employee: emp, action: "deactivate" })
                              }
                              className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 hover:underline"
                            >
                              <UserX className="w-4 h-4" />
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmTarget({ employee: emp, action: "activate" })
                              }
                              className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
                            >
                              <UserCheck className="w-4 h-4" />
                              Activate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </PageContainer>

      <AddEmployeeModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {
          setSuccessMessage("Employee created successfully. A temporary password has been sent to their email.");
          loadEmployees();
        }}
      />

      {/* Activate / Deactivate confirmation */}
      {confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-2">
              {confirmTarget.action === "activate" ? "Activate employee?" : "Deactivate employee?"}
            </h2>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
              {confirmTarget.action === "activate"
                ? `${confirmTarget.employee.username} will be set to Active.`
                : `${confirmTarget.employee.username} will be set to Inactive.`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                disabled={togglingId !== null}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmToggle}
                disabled={togglingId !== null}
                className={`flex-1 px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50 ${
                  confirmTarget.action === "activate"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                {togglingId !== null ? "Updating…" : confirmTarget.action === "activate" ? "Activate" : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
