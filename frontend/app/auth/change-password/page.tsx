'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { setAuth, getAuthUser } from '../../utils/auth';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isForcedPasswordChange, setIsForcedPasswordChange] = useState(false);
  const [authToken, setAuthToken] = useState('');
  
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    const forcePasswordChange = localStorage.getItem('forcePasswordChange') === 'true';
    
    if (storedToken) {
      setAuthToken(storedToken);
      setIsForcedPasswordChange(forcePasswordChange);
      setIsAuthLoading(false);
    } else {
      router.push('/auth/employee-login');
    }
  }, [router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const deleteCookie = (name: string) => {
    document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      if (!formData.newPassword || !formData.confirmPassword) {
        setError('New password and confirm password are required');
        return;
      }

      if (formData.newPassword !== formData.confirmPassword) {
        setError('New passwords do not match');
        return;
      }

      if (formData.newPassword.length < 8) {
        setError('New password must be at least 8 characters');
        return;
      }

      const hasUppercase = /[A-Z]/.test(formData.newPassword);
      const hasLowercase = /[a-z]/.test(formData.newPassword);
      const hasNumber = /[0-9]/.test(formData.newPassword);
      const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};:'",.<>?\/\\|`~]/.test(formData.newPassword);

      if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
        setError('Password must contain uppercase, lowercase, number, and special character');
        return;
      }

      const body: any = {
        newPassword: formData.newPassword,
        confirmPassword: formData.confirmPassword,
      };

      if (!isForcedPasswordChange) {
        if (!formData.currentPassword) {
          setError('Current password is required');
          return;
        }
        body.currentPassword = formData.currentPassword;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to change password');
        return;
      }

      // Backend returns fresh token pair — store them so this device stays logged in
      if (data.accessToken) {
        const user = getAuthUser();
        setAuth(data.accessToken, user, data.refreshToken);
      }

      localStorage.removeItem('forcePasswordChange');
      deleteCookie('force-password-change');
      setSuccess('Password changed successfully! Redirecting...');
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (err) {
      setError('An error occurred while changing password');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gradient-to-br from-background to-background-alt">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-background-alt px-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-900 rounded-lg shadow-2xl p-8 border border-gray-800">
          <h1 className="text-3xl font-bold text-white mb-2">
            {isForcedPasswordChange ? 'Set Your Password' : 'Change Password'}
          </h1>
          <p className="text-gray-400 mb-6">
            {isForcedPasswordChange ? 'You must set a new password before continuing' : 'Set a new password for your account'}
          </p>

          {error && (
            <div className="mb-4 p-4 bg-red-500 bg-opacity-10 border border-red-500 rounded-lg">
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-500 bg-opacity-10 border border-green-500 rounded-lg">
              <p className="text-green-500 text-sm">{success}</p>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            {!isForcedPasswordChange && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  name="currentPassword"
                  value={formData.currentPassword}
                  onChange={handleInputChange}
                  placeholder="Enter your current password"
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  disabled={loading}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                New Password
              </label>
              <input
                type="password"
                name="newPassword"
                value={formData.newPassword}
                onChange={handleInputChange}
                placeholder="Enter new password (min 8 characters)"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                disabled={loading}
              />
              <p className="text-xs text-gray-500 mt-1">
                Must contain: uppercase, lowercase, number, special character
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="Confirm new password"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              {loading ? 'Saving Password...' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
