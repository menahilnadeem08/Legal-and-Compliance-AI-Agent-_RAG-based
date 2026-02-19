'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Navigation from '../components/Navigation';
import PageContainer from '../components/PageContainer';

interface Employee {
  id: number;
  username: string;
  email: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    name: '',
  });

  // Check auth and load employees
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
      return;
    }

    if (session?.user?.email) {
      loadEmployees();
    }
  }, [status, session, router]);

  const loadEmployees = async () => {
    try {
      const token = (session?.user as any)?.token;
      if (!token) {
        console.error('No authentication token available');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/employees`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        // Fallback: if token not available, user needs to be authenticated
        console.error('Failed to load employees');
        return;
      }

      const data = await response.json();
      setEmployees(data.employees || []);
    } catch (err) {
      console.error('Error loading employees:', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      setSuccessMessage('');

      if (!formData.username || !formData.email) {
        setError('Username and email are required');
        return;
      }

      const token = (session?.user as any)?.token;
      if (!token) {
        setError('Authentication token not found. Please refresh and try again.');
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/admin/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to create employee');
        return;
      }

      setSuccessMessage('Employee created successfully! A temporary password has been sent to their email.');
      setFormData({ username: '', email: '', name: '' });
      await loadEmployees();
    } catch (err) {
      setError('An error occurred while creating employee');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (employeeId: number) => {
    if (!confirm('Are you sure you want to deactivate this employee?')) {
      return;
    }

    try {
      const token = (session?.user as any)?.token;
      if (!token) {
        setError('Authentication token not found');
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/employees/${employeeId}/deactivate`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        setError('Failed to deactivate employee');
        return;
      }

      setSuccessMessage('Employee deactivated successfully');
      await loadEmployees();
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  const handleActivate = async (employeeId: number) => {
    if (!confirm('Are you sure you want to activate this employee?')) {
      return;
    }

    try {
      const token = (session?.user as any)?.token;
      if (!token) {
        setError('Authentication token not found');
        return;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/admin/employees/${employeeId}/activate`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        setError('Failed to activate employee');
        return;
      }

      setSuccessMessage('Employee activated successfully');
      await loadEmployees();
    } catch (err) {
      setError('An error occurred');
      console.error(err);
    }
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <PageContainer>
        <div className="w-full h-full flex flex-col gap-6">
          {/* Header */}
          <div className="glass-border rounded-2xl p-6 sm:p-8 flex-shrink-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Admin Dashboard</h1>
            <p className="text-sm text-gray-400">Manage employees and system configuration</p>
          </div>

          {/* Success/Error Messages */}
          {error && (
            <div className="mb-5 p-3 sm:p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-3 sm:p-4 bg-green-500/20 border border-green-500 rounded-lg text-green-400 text-sm">
              {successMessage}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 mb-6">
            {/* Create Employee Form */}
            <div className="lg:col-span-1">
              <div className="glass-border rounded-2xl p-6 sm:p-8">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                  <span>👤</span> Create Employee
                </h2>

                <form onSubmit={handleCreateEmployee} className="space-y-5">
                  <div>
                    <label htmlFor="username" className="block text-sm font-semibold text-gray-300 mb-3">
                      Username
                    </label>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      value={formData.username}
                      onChange={handleInputChange}
                      placeholder="john_doe"
                      disabled={loading}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold text-gray-300 mb-3">
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="john@example.com"
                      disabled={loading}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
                    />
                  </div>

                  <div>
                    <label htmlFor="name" className="block text-sm font-semibold text-gray-300 mb-3">
                      Full Name (optional)
                    </label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      value={formData.name}
                      onChange={handleInputChange}
                      placeholder="John Doe"
                      disabled={loading}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200"
                  >
                    {loading ? 'Creating...' : 'Create Employee'}
                  </button>
                </form>
              </div>
            </div>

            {/* Employees List */}
            <div className="lg:col-span-2">
              <div className="glass-border rounded-2xl p-6 sm:p-8">
                <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                  <span>📋</span> Employees List
                </h2>

              {employees.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400 text-lg">No employees created yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-600">
                        <th className="text-left py-3 px-4 font-semibold text-gray-300">Username</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-300">Email</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-300">Name</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-300">Status</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-300">Created</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-300">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((employee) => (
                        <tr key={employee.id} className="border-b border-gray-700 hover:bg-gray-800/50 transition-colors">
                          <td className="py-3 px-4 text-white">{employee.username}</td>
                          <td className="py-3 px-4 text-gray-400 text-sm">{employee.email}</td>
                          <td className="py-3 px-4 text-gray-400">{employee.name || '-'}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                employee.is_active
                                  ? 'bg-green-500/20 text-green-300 border border-green-500/50'
                                  : 'bg-red-500/20 text-red-300 border border-red-500/50'
                              }`}
                            >
                              {employee.is_active ? '● Active' : '● Inactive'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-400 text-sm">
                            {new Date(employee.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4">
                            {employee.is_active ? (
                              <button
                                onClick={() => handleDeactivate(employee.id)}
                                className="text-red-400 hover:text-red-300 font-semibold text-sm transition-colors"
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActivate(employee.id)}
                                className="text-green-400 hover:text-green-300 font-semibold text-sm transition-colors"
                              >
                                Activate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </PageContainer>
    </>
  );
}
