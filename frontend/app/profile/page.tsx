'use client';

import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Navigation from '../components/Navigation';

interface UserInfo {
  id: number;
  username: string;
  email: string;
  name?: string;
  role: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isEmployee, setIsEmployee] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check for employee authentication (localStorage)
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
      try {
        const userData = JSON.parse(userStr);
        setUser(userData);
        setIsEmployee(true);
        setLoading(false);
        return;
      } catch (err) {
        console.error('Failed to parse user data:', err);
      }
    }

    // Wait for NextAuth to load
    if (status === 'loading') {
      return;
    }

    // Check for admin authentication (NextAuth)
    if (session && session.user) {
      const adminUser: UserInfo = {
        id: 0, // Google doesn't provide ID
        username: session.user.email || 'Admin User',
        email: session.user.email || '',
        name: session.user.name || 'Admin',
        role: 'admin',
      };
      setUser(adminUser);
      setIsEmployee(false);
      setLoading(false);
      return;
    }

    // Not authenticated - redirect to login
    if (status === 'unauthenticated') {
      router.push('/auth/login');
      setLoading(false);
    }
  }, [status, session, router]);

  const handleLogout = async () => {
    if (isEmployee) {
      // Employee logout
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      router.push('/auth/employee-login');
    } else {
      // Admin logout
      await signOut({ redirect: false });
      router.push('/auth/login');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setPasswordLoading(true);
      setError('');
      const token = localStorage.getItem('token');

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
          confirmPassword: passwordForm.confirmPassword,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to change password');
        return;
      }

      setSuccessMessage('Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordModal(false);
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      setError('An error occurred while changing password');
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loading || status === 'loading') {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-background to-background-alt">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <>
      <Navigation />
      <div className="w-screen min-h-screen bg-gradient-to-br from-background to-background-alt pt-6 px-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="glass-border rounded-2xl p-8 mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">Profile</h1>
            <p className="text-gray-400">Manage your account settings</p>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-green-500/20 border border-green-500 rounded-lg text-green-400">
              {successMessage}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {/* User Info */}
          <div className="glass-border rounded-2xl p-8 mb-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Username */}
              <div>
                <label className="text-gray-400 text-sm font-semibold">Username</label>
                <p className="text-white text-lg mt-2">{user.username}</p>
              </div>

              {/* Name */}
              <div>
                <label className="text-gray-400 text-sm font-semibold">Name</label>
                <p className="text-white text-lg mt-2">{user.name || 'N/A'}</p>
              </div>

              {/* Email */}
              <div>
                <label className="text-gray-400 text-sm font-semibold">Email</label>
                <p className="text-white text-lg mt-2">{user.email}</p>
              </div>

              {/* Role */}
              <div>
                <label className="text-gray-400 text-sm font-semibold">Role</label>
                <p className="text-white text-lg mt-2 uppercase">{user.role}</p>
              </div>

              {/* Status */}
              <div>
                <label className="text-gray-400 text-sm font-semibold">Status</label>
                <p className="text-white text-lg mt-2">Active</p>
              </div>

              {/* Authentication */}
              <div>
                <label className="text-gray-400 text-sm font-semibold">Authentication</label>
                <p className="text-white text-lg mt-2">{isEmployee ? 'Local Login' : 'Google OAuth'}</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-6 border-t border-gray-600 space-y-4">
              {isEmployee && (
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all"
                >
                  Change Password
                </button>
              )}
              <button
                onClick={handleLogout}
                className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Password Modal */}
          {showPasswordModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-6 z-50">
              <div className="glass-border rounded-2xl p-8 max-w-md w-full">
                <h2 className="text-2xl font-bold text-white mb-6">Change Password</h2>

                <form onSubmit={handlePasswordChange} className="space-y-4">
                  {/* Current Password */}
                  <div>
                    <label className="text-gray-400 text-sm font-semibold block mb-2">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                      }
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      disabled={passwordLoading}
                    />
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="text-gray-400 text-sm font-semibold block mb-2">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                      }
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      disabled={passwordLoading}
                    />
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="text-gray-400 text-sm font-semibold block mb-2">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                      }
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      disabled={passwordLoading}
                    />
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-4 pt-4">
                    <button
                      type="submit"
                      disabled={passwordLoading}
                      className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold rounded-lg transition-all"
                    >
                      {passwordLoading ? 'Changing...' : 'Change Password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordModal(false);
                        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                        setError('');
                      }}
                      className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white font-semibold rounded-lg transition-all border border-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
