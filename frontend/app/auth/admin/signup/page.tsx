'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { setAuth, getAuthToken } from '../../../utils/auth';

type Step = 'signup' | 'otp';

export default function AdminSignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('signup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [otpValues, setOtpValues] = useState<string[]>(['', '', '', '', '', '']);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    companyName: ''
  });

  useEffect(() => {
    if (getAuthToken()) {
      router.push('/');
      return;
    }
    setIsAuthLoading(false);
  }, [router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateFormData = (): string | null => {
    if (!formData.username.trim()) return 'Username is required';
    if (formData.username.length < 3) return 'Username must be at least 3 characters';
    if (!formData.email.trim()) return 'Email is required';
    if (!formData.email.includes('@')) return 'Please enter a valid email';
    if (!formData.password) return 'Password is required';
    if (formData.password.length < 8) return 'Password must be at least 8 characters';
    if (formData.password !== formData.confirmPassword) return 'Passwords do not match';
    return null;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError('');

      const validationError = validateFormData();
      if (validationError) {
        setError(validationError);
        setLoading(false);
        return;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/admin/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username.trim(),
          email: formData.email.trim(),
          password: formData.password,
          confirmPassword: formData.confirmPassword,
          companyName: formData.companyName.trim()
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setError(data.error || 'Username or email already exists');
        } else if (response.status === 400) {
          setError(data.details ? `Password requirements: ${data.details.join(', ')}` : data.error || 'Invalid request');
        } else {
          setError(data.error || 'Signup failed');
        }
        return;
      }

      if (data.requiresVerification) {
        setVerifiedEmail(data.email);
        setStep('otp');
        setResendCooldown(60);
        setSuccess('A verification code has been sent to your email.');
      }
    } catch (err) {
      setError('An error occurred during signup');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newValues = [...otpValues];
    newValues[index] = value.slice(-1);
    setOtpValues(newValues);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newValues = [...otpValues];
    for (let i = 0; i < 6; i++) {
      newValues[i] = pasted[i] || '';
    }
    setOtpValues(newValues);
    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otp = otpValues.join('');
    if (otp.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/admin/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifiedEmail, otp }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Verification failed');
        setOtpValues(['', '', '', '', '', '']);
        otpRefs.current[0]?.focus();
        return;
      }

      setAuth(data.token, data.user);
      router.push('/');
    } catch (err) {
      setError('An error occurred during verification');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/admin/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verifiedEmail }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to resend OTP');
        return;
      }

      setSuccess('A new verification code has been sent to your email.');
      setResendCooldown(60);
      setOtpValues(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (err) {
      setError('Failed to resend verification code');
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
        <div className="glass-border rounded-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                ⚖️
              </div>
            </div>
            {step === 'signup' ? (
              <>
                <h1 className="text-3xl font-bold text-white mb-2">Admin Registration</h1>
                <p className="text-gray-400">Create your admin account to manage documents</p>
              </>
            ) : (
              <>
                <h1 className="text-3xl font-bold text-white mb-2">Verify Your Email</h1>
                <p className="text-gray-400">
                  Enter the 6-digit code sent to <span className="text-blue-400 font-medium">{verifiedEmail}</span>
                </p>
              </>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/20 border border-green-500 rounded-lg">
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}

          {step === 'signup' ? (
            /* Signup Form */
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

              {/* Confirm Password */}
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
          ) : (
            /* OTP Verification Form */
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              {/* OTP Input Boxes */}
              <div className="flex justify-center gap-3" onPaste={handleOtpPaste}>
                {otpValues.map((val, i) => (
                  <input
                    key={i}
                    ref={(el) => { otpRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={val}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-bold bg-dark/50 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-white transition"
                    disabled={loading}
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {/* Verify Button */}
              <button
                type="submit"
                disabled={loading || otpValues.join('').length !== 6}
                className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-3 rounded-lg transition transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Verifying...
                  </>
                ) : (
                  'Verify Email'
                )}
              </button>

              {/* Resend OTP */}
              <div className="text-center">
                <p className="text-gray-400 text-sm">
                  Didn&apos;t receive the code?{' '}
                  {resendCooldown > 0 ? (
                    <span className="text-gray-500">Resend in {resendCooldown}s</span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={loading}
                      className="text-blue-400 hover:text-blue-300 font-semibold transition disabled:opacity-50"
                    >
                      Resend Code
                    </button>
                  )}
                </p>
              </div>

              {/* Back to Signup */}
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setStep('signup'); setError(''); setSuccess(''); setOtpValues(['', '', '', '', '', '']); }}
                  className="text-gray-400 hover:text-gray-300 text-sm transition"
                >
                  Back to signup
                </button>
              </div>
            </form>
          )}

          {step === 'signup' && (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
