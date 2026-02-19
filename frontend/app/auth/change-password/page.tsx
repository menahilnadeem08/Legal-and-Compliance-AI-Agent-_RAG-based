'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function ChangePasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isActivationMode, setIsActivationMode] = useState(false);
  const [isForcedPasswordChange, setIsForcedPasswordChange] = useState(false);
  const [activationToken, setActivationToken] = useState('');
  const [authToken, setAuthToken] = useState('');
  
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  // Check authentication and determine if in activation or forced password change mode
  useEffect(() => {
    // Check for activation token in URL
    const urlToken = searchParams.get('activation_token');
    const authTokenFromStorage = localStorage.getItem('token');
    
    // Check if user is forced to change password (came from temp password login)
    const forcePasswordChange = localStorage.getItem('forcePasswordChange') === 'true';
    
    if (urlToken) {
      // Activation mode - user is coming from /activate page
      console.log('Activation mode detected');
      setActivationToken(urlToken);
      setIsActivationMode(true);
      setIsForcedPasswordChange(false);
      setIsAuthLoading(false);
    } else if (authTokenFromStorage) {
      // User is already logged in
      console.log('User authenticated');
      setAuthToken(authTokenFromStorage);
      
      if (forcePasswordChange) {
        // Forced password change mode (temp password login)
        console.log('Forced password change mode - user logged in with temp password');
        setIsForcedPasswordChange(true);
      } else {
        // Normal mode - user can change password optionally
        console.log('Normal mode - user changing password');
        setIsForcedPasswordChange(false);
      }
      
      setIsActivationMode(false);
      setIsAuthLoading(false);
    } else {
      // No token and no auth - redirect to login
      console.log('No auth or activation token found, redirecting to login');
      router.push('/auth/employee-login');
    }
  }, [router, searchParams]);

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

      // Common validation
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

      // Password requirements validation
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

      // ACTIVATION MODE: Use activation token
      if (isActivationMode) {
        body.token = activationToken;
      } else if (isForcedPasswordChange) {
        // FORCED PASSWORD CHANGE: No current password needed, already authenticated
        // Just send new password
      } else {
        // NORMAL MODE: Require current password
        if (!formData.currentPassword) {
          setError('Current password is required');
          return;
        }
        body.currentPassword = formData.currentPassword;
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add auth header for authenticated requests (both normal and forced password change)
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/change-password`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || 'Failed to change password');
        return;
      }

      const data = await response.json();
      
      // ACTIVATION MODE: Store tokens and redirect to dashboard
      if (isActivationMode && data.accessToken && data.refreshToken) {
        localStorage.setItem('token', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        localStorage.removeItem('forcePasswordChange');
        deleteCookie('force-password-change');
        if (data.user) {
          localStorage.setItem('user', JSON.stringify(data.user));
        }
        setSuccess('Password set successfully! Redirecting to dashboard...');
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } else {
        localStorage.removeItem('forcePasswordChange');
        deleteCookie('force-password-change');
        setSuccess('Password changed successfully! Redirecting...');
        setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setTimeout(() => {
          router.push('/');
        }, 2000);
      }
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
            {isActivationMode || isForcedPasswordChange ? 'Set Your Password' : 'Change Password'}
          </h1>
          <p className="text-gray-400 mb-6">
            {isActivationMode ? 'Complete your account activation by setting a password' : isForcedPasswordChange ? 'You must set a new password before continuing' : 'Set a new password for your account'}
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
            {/* Current Password field - only show in normal password change mode */}
            {!isActivationMode && !isForcedPasswordChange && (
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
              {loading ? 'Saving Password...' : (isActivationMode ? 'Complete Activation' : 'Change Password')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
