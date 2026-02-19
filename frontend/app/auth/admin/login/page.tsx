'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');

  // Redirect authenticated users away from login page
  useEffect(() => {
    // Check if admin is logged in via localStorage
    const adminToken = localStorage.getItem('adminToken');
    const adminUserStr = localStorage.getItem('adminUser');
    
    // Check if employee is logged in via localStorage
    const empToken = localStorage.getItem('token');
    const empUserStr = localStorage.getItem('user');

    if ((adminToken && adminUserStr) || (empToken && empUserStr)) {
      router.push('/');
      return;
    }

    setIsAuthLoading(false);
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError('');

      if (!loginIdentifier || !password) {
        setError('Username/Email and password are required');
        return;
      }

      // Determine if input is email or username
      const isEmail = loginIdentifier.includes('@');
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          [isEmail ? 'email' : 'username']: loginIdentifier,
          password
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        
        if (response.status === 401) {
          setError('Invalid credentials or not an admin');
        } else if (response.status === 400) {
          setError(data.error || 'Invalid request');
        } else {
          setError(data.error || 'Login failed');
        }
        return;
      }

      const data = await response.json();
      
      // Store admin token and user info in localStorage
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminUser', JSON.stringify(data.user));

      // Redirect to admin dashboard
      router.push('/');
    } catch (err) {
      setError('An error occurred during login');
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
        {/* Main Card */}
        <div className="glass-border rounded-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                ⚖️
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Admin Login</h1>
            <p className="text-gray-400">Sign in to your admin account</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Username/Email */}
            <div>
              <label htmlFor="loginIdentifier" className="block text-sm font-medium text-gray-300 mb-2">
                Username or Email
              </label>
              <input
                type="text"
                id="loginIdentifier"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="admin@example.com or your_username"
                className="w-full px-4 py-3 bg-dark/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500 transition"
                disabled={loading}
                required
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full px-4 py-3 bg-dark/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500 transition pr-12"
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  disabled={loading}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-3 rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-6 flex items-center gap-4">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-gray-700"></div>
            <span className="text-gray-500 text-sm">or</span>
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-gray-700"></div>
          </div>

          {/* Footer */}
          <div className="text-center space-y-4">
            <p className="text-gray-400 text-sm">
              Don't have an admin account?{' '}
              <Link href="/auth/admin/signup" className="text-blue-400 hover:text-blue-300 font-semibold transition">
                Create One
              </Link>
            </p>
            <p className="text-gray-400 text-sm">
              Employee?{' '}
              <Link href="/auth/employee-login" className="text-blue-400 hover:text-blue-300 font-semibold transition">
                Employee Login
              </Link>
            </p>
            <p className="text-gray-400 text-sm">
              Google OAuth?{' '}
              <Link href="/auth/login" className="text-blue-400 hover:text-blue-300 font-semibold transition">
                Continue with Google
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
