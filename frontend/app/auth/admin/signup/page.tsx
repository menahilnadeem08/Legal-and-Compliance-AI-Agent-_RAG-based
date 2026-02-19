'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminSignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyName: ''
  });

  // Redirect authenticated users away from signup page
  useEffect(() => {
    // Check if user is logged in (both admin and employee)
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (token && userStr) {
      router.push('/');
      return;
    }

    // Could also check NextAuth session here if needed
    setIsAuthLoading(false);
  }, [router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateFormData = (): string | null => {
    if (!formData.username.trim()) {
      return 'Username is required';
    }
    if (formData.username.length < 3) {
      return 'Username must be at least 3 characters';
    }
    if (!formData.email.trim()) {
      return 'Email is required';
    }
    if (!formData.email.includes('@')) {
      return 'Please enter a valid email';
    }
    if (!formData.password) {
      return 'Password is required';
    }
    if (formData.password.length < 8) {
      return 'Password must be at least 8 characters';
    }
    if (formData.password !== formData.confirmPassword) {
      return 'Passwords do not match';
    }
    return null;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      setError('');

      // Client-side validation
      const validationError = validateFormData();
      if (validationError) {
        setError(validationError);
        setLoading(false);
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/admin/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username.trim(),
          email: formData.email.trim(),
          password: formData.password,
          confirmPassword: formData.confirmPassword,
          companyName: formData.companyName.trim()
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        
        if (response.status === 409) {
          setError(data.error || 'Username or email already exists');
        } else if (response.status === 400) {
          if (data.details) {
            setError(`Password requirements: ${data.details.join(', ')}`);
          } else {
            setError(data.error || 'Invalid request');
          }
        } else {
          setError(data.error || 'Signup failed');
        }
        return;
      }

      const data = await response.json();
      
      // Store token in localStorage (for consistency with admin auth)
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminUser', JSON.stringify(data.user));

      // Redirect to admin dashboard
      router.push('/');
    } catch (err) {
      setError('An error occurred during signup');
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
            <h1 className="text-3xl font-bold text-white mb-2">Admin Registration</h1>
            <p className="text-gray-400">Create your admin account to manage documents</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Signup Form */}
          <form onSubmit={handleSignup} className="space-y-5">
            {/* Company Name */}
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-gray-300 mb-2">
                Company Name (Optional)
              </label>
              <input
                type="text"
                id="companyName"
                name="companyName"
                value={formData.companyName}
                onChange={handleInputChange}
                placeholder="Your company name"
                className="w-full px-4 py-3 bg-dark/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500 transition"
                disabled={loading}
              />
            </div>

            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
                Username
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                placeholder="Choose a username"
                className="w-full px-4 py-3 bg-dark/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500 transition"
                disabled={loading}
                required
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="your@email.com"
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
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  placeholder="Enter a strong password"
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
              <p className="text-xs text-gray-400 mt-2">
                Password must be at least 8 characters with uppercase, lowercase, number, and special character
              </p>
            </div>

            {/* Confirm Password - End of form fields before submit button */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  placeholder="Confirm your password"
                  className="w-full px-4 py-3 bg-dark/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-gray-500 transition pr-12"
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  disabled={loading}
                >
                  {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {/* Signup Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-3 rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Creating account...
                </>
              ) : (
                'Create Admin Account'
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
              Already have an admin account?{' '}
              <Link href="/auth/admin/login" className="text-blue-400 hover:text-blue-300 font-semibold transition">
                Sign In
              </Link>
            </p>
            <p className="text-gray-400 text-sm">
              Employee?{' '}
              <Link href="/auth/employee-login" className="text-blue-400 hover:text-blue-300 font-semibold transition">
                Employee Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
