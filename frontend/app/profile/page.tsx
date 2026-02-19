'use client';

import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import Navigation from '../components/Navigation';
import PageContainer from '../components/PageContainer';
import { getAuthToken, getAuthUser, isEmployeeUser, clearAllAuth } from '../utils/auth';

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

    const storedUser = getAuthUser();

    if (storedUser) {
      const userInfo: UserInfo = {
        id: storedUser.id || 0,
        username: storedUser.username || storedUser.email || 'User',
        email: storedUser.email || '',
        name: storedUser.name || storedUser.username || '',
        role: storedUser.role || 'admin',
      };
      setUser(userInfo);
      setIsEmployee(storedUser.role === 'employee');
      setLoading(false);
      return;
    }

    if (status === 'loading') return;

    if (session?.user) {
      const sessionUser: UserInfo = {
        id: 0,
        username: session.user.email || 'Admin User',
        email: session.user.email || '',
        name: session.user.name || 'Admin',
        role: 'admin',
      };
      setUser(sessionUser);
      setIsEmployee(false);
      setLoading(false);
      return;
    }

    if (status === 'unauthenticated' && !getAuthToken()) {
      router.push('/auth/login');
      setLoading(false);
    }
  }, [status, session, router]);

  const handleLogout = async () => {
    try {
      const token = getAuthToken(session);
      if (token) {
        await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
        });
      }
    } catch (error) {
      console.error('Logout API call failed:', error);
    }
    clearAllAuth();
    await signOut({ redirect: false });
    router.push('/auth/login');
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
      const token = getAuthToken(session);

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
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-background to-background-alt">
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
      <PageContainer>
        <div className="w-full">
          {/* Main Content */}
          <div className="flex flex-col w-full">
            {/* Success Message */}
            {successMessage && (
              <div className="w-full mb-6 p-4 sm:p-5 bg-green-500/20 border border-green-500/50 rounded-xl text-green-400 text-sm sm:text-base">
                {successMessage}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="w-full mb-6 p-4 sm:p-5 bg-red-500/20 border border-red-500/50 rounded-xl text-red-400 text-sm sm:text-base">
                {error}
              </div>
            )}

            {/* Page Header */}
            <div className="w-full mb-8 sm:mb-10">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-2 sm:mb-3">Profile</h1>
              <p className="text-sm sm:text-base text-gray-400 leading-relaxed">Manage your account settings and security preferences</p>
            </div>

            {/* Two Column Layout for Large Screens */}
            <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
            {/* Main Profile Card - Left/Full */}
            <div className="lg:col-span-2">
              {/* User Info Card */}
              <div className="glass-border rounded-xl border border-slate-600/30 p-6 sm:p-8">
                {/* Card Header */}
                <div className="mb-8 pb-6 border-b border-slate-600/30">
                  <h2 className="text-lg sm:text-xl font-bold text-white mb-3 flex items-center gap-2">
                    <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
                    Account Information
                  </h2>
                </div>

                {/* User Fields Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                  {/* Username */}
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide mb-2">Username</p>
                    <p className="text-base sm:text-lg text-white font-medium leading-tight">{user.username}</p>
                  </div>

                  {/* Email */}
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide mb-2">Email Address</p>
                    <p className="text-base sm:text-lg text-white font-medium leading-tight break-all">{user.email}</p>
                  </div>

                  {/* Name */}
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide mb-2">Full Name</p>
                    <p className="text-base sm:text-lg text-white font-medium leading-tight">{user.name || 'Not provided'}</p>
                  </div>

                  {/* Role */}
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide mb-2">Role</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                      <p className="text-base sm:text-lg text-white font-medium capitalize">{user.role}</p>
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide mb-2">Status</p>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                      <p className="text-base sm:text-lg text-white font-medium">Active</p>
                    </div>
                  </div>

                  {/* Authentication */}
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500 font-medium uppercase tracking-wide mb-2">Authentication</p>
                    <p className="text-base sm:text-lg text-white font-medium">{isEmployee ? 'Local Login' : 'Google OAuth'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Card - Right/Full */}
            <div className="lg:col-span-1">
              <div className="glass-border rounded-xl border border-slate-600/30 p-6 sm:p-8 h-full flex flex-col">
                {/* Card Header */}
                <div className="mb-6 pb-6 border-b border-slate-600/30">
                  <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                    <span className="w-1 h-6 bg-amber-500 rounded-full"></span>
                    Security
                  </h2>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col gap-3 sm:gap-4">
                  {isEmployee && (
                    <button
                      onClick={() => setShowPasswordModal(true)}
                      className="w-full h-11 sm:h-12 px-4 sm:px-5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold text-sm sm:text-base rounded-xl transition-all duration-200 shadow-lg hover:shadow-blue-500/30 focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-1 focus:ring-offset-slate-900 active:scale-95"
                    >
                      Change Password
                    </button>
                  )}

                  <button
                    onClick={handleLogout}
                    className="w-full h-11 sm:h-12 px-4 sm:px-5 bg-slate-700/30 hover:bg-slate-700/50 border border-slate-600/50 text-gray-300 hover:text-gray-200 font-semibold text-sm sm:text-base rounded-xl transition-all duration-200 focus:ring-2 focus:ring-slate-500/50 focus:ring-offset-1 focus:ring-offset-slate-900 active:scale-95"
                  >
                    Logout
                  </button>
                </div>

                {/* Security Info */}
                <div className="mt-auto pt-6 border-t border-slate-600/30">
                  <p className="text-xs text-gray-500 leading-relaxed text-center">
                    Keep your account secure by changing your password regularly and logging out from unused devices.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

          {/* Password Modal */}
          {showPasswordModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <div className="glass-border rounded-xl border border-slate-600/30 p-6 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto">
                {/* Modal Header */}
                <div className="mb-6 pb-4 border-b border-slate-600/30">
                  <h2 className="text-xl sm:text-2xl font-bold text-white">Change Password</h2>
                  <p className="text-xs sm:text-sm text-gray-400 mt-2">Update your password to keep your account secure</p>
                </div>

                <form onSubmit={handlePasswordChange} className="space-y-4 sm:space-y-5">
                  {/* Current Password */}
                  <div>
                    <label className="text-xs sm:text-sm text-gray-400 font-medium uppercase tracking-wide block mb-2">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.currentPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                      }
                      placeholder="Enter your current password"
                      className="w-full h-10 sm:h-11 px-4 sm:px-5 text-sm sm:text-base bg-slate-800/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-slate-500 outline-none transition-all"
                      disabled={passwordLoading}
                    />
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="text-xs sm:text-sm text-gray-400 font-medium uppercase tracking-wide block mb-2">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                      }
                      placeholder="Enter a new password"
                      className="w-full h-10 sm:h-11 px-4 sm:px-5 text-sm sm:text-base bg-slate-800/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-slate-500 outline-none transition-all"
                      disabled={passwordLoading}
                    />
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="text-xs sm:text-sm text-gray-400 font-medium uppercase tracking-wide block mb-2">
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) =>
                        setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                      }
                      placeholder="Confirm your new password"
                      className="w-full h-10 sm:h-11 px-4 sm:px-5 text-sm sm:text-base bg-slate-800/50 border border-slate-600/50 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-slate-500 outline-none transition-all"
                      disabled={passwordLoading}
                    />
                  </div>

                  {/* Button Group */}
                  <div className="flex gap-3 sm:gap-4 pt-6 border-t border-slate-600/30">
                    <button
                      type="submit"
                      disabled={passwordLoading}
                      className="flex-1 h-11 sm:h-12 px-4 sm:px-5 text-sm sm:text-base bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-blue-500/30 focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-1 focus:ring-offset-slate-900 active:scale-95"
                    >
                      {passwordLoading ? 'Updating...' : 'Change Password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordModal(false);
                        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                        setError('');
                      }}
                      disabled={passwordLoading}
                      className="flex-1 h-11 sm:h-12 px-4 sm:px-5 text-sm sm:text-base bg-slate-700/30 hover:bg-slate-700/50 border border-slate-600/50 text-gray-300 hover:text-gray-200 font-semibold rounded-xl transition-all duration-200 focus:ring-2 focus:ring-slate-500/50 focus:ring-offset-1 focus:ring-offset-slate-900 active:scale-95 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </PageContainer>
    </>
  );
}
