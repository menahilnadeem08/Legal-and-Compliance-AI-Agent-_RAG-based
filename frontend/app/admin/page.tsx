'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Navigation from '../components/Navigation';

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
    password: '',
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

      if (!formData.username || !formData.password || !formData.email) {
        setError('Username, password, and email are required');
        return;
      }

      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters');
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

      setSuccessMessage('Employee created successfully!');
      setFormData({ username: '', password: '', email: '', name: '' });
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
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Create Employee Form */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Create Employee</h2>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              {successMessage && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-700 text-sm">{successMessage}</p>
                </div>
              )}

              <form onSubmit={handleCreateEmployee} className="space-y-4">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    placeholder="Minimum 6 characters"
                    disabled={loading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition duration-200"
                >
                  {loading ? 'Creating...' : 'Create Employee'}
                </button>
              </form>
            </div>
          </div>

          {/* Employees List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Employees</h2>

              {employees.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500">No employees created yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Username</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Email</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Name</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Created</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-900">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {employees.map((employee) => (
                        <tr key={employee.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-3 px-4 text-gray-900">{employee.username}</td>
                          <td className="py-3 px-4 text-gray-600 text-sm">{employee.email}</td>
                          <td className="py-3 px-4 text-gray-600">{employee.name || '-'}</td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                employee.is_active
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {employee.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-600 text-sm">
                            {new Date(employee.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4">
                            {employee.is_active ? (
                              <button
                                onClick={() => handleDeactivate(employee.id)}
                                className="text-red-600 hover:text-red-800 font-medium text-sm"
                              >
                                Deactivate
                              </button>
                            ) : (
                              <button
                                onClick={() => handleActivate(employee.id)}
                                className="text-green-600 hover:text-green-800 font-medium text-sm"
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
      </main>
      </div>
    </>
  );
}
