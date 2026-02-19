'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { setAuth, getAuthToken } from '../../utils/auth';

export default function LoginPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    if (status === 'loading') {
      setIsAuthLoading(true);
      return;
    }

    // Google OAuth admin — sync session to unified store and redirect
    if (session?.user && (session.user as any)?.token) {
      setAuth((session.user as any).token, { ...session.user, role: 'admin' });
      setIsAuthLoading(false);
      router.push('/');
      return;
    }

    // Already authenticated
    if (getAuthToken()) {
      setIsAuthLoading(false);
      router.push('/');
      return;
    }

    setIsAuthLoading(false);
  }, [session, status, router]);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      await signIn('google', { callbackUrl: '/auth/login' });
    } catch (err) {
      setError('An error occurred during sign in');
      console.error(err);
      setLoading(false);
    }
  };

  // Show loading state while checking authentication
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
      <div className="w-full max-w-2xl">
        {/* Main Card */}
        <div className="glass-border rounded-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-lg">
                ⚖️
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Legal Compliance Portal</h1>
            <p className="text-gray-400">Choose how you want to access the platform</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/20 border border-red-500 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Authentication Options - Grid Layout */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Google OAuth Option (Original) */}
            <div className="flex flex-col">
              <h2 className="text-xl font-semibold text-white mb-4">Google Sign In</h2>
              <p className="text-gray-400 text-sm mb-4">
                Sign in with your Google account as an admin.
              </p>
              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-200 shadow-lg hover:shadow-blue-500/50"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#ffffff"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#ffffff"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#ffffff"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#ffffff"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {loading ? 'Signing in...' : 'Continue with Google'}
              </button>
            </div>

            {/* Local Admin Auth Option */}
            <div className="flex flex-col">
              <h2 className="text-xl font-semibold text-white mb-4">Admin Account</h2>
              <p className="text-gray-400 text-sm mb-4">
                Sign in with your admin username or email.
              </p>
              <div className="space-y-2 flex-1 flex flex-col justify-end">
                <Link
                  href="/auth/admin/login"
                  className="w-full text-center px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg hover:shadow-green-500/50"
                >
                  Admin Sign In
                </Link>
                <p className="text-gray-400 text-xs text-center">
                  Don't have an account?{' '}
                  <Link href="/auth/admin/signup" className="text-blue-400 hover:text-blue-300">
                    Create one
                  </Link>
                </p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gradient-to-br from-background to-background-alt text-gray-400">or</span>
            </div>
          </div>

          {/* Employee Login */}
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-3">
              Are you an employee?
            </p>
            <Link
              href="/auth/employee-login"
              className="inline-block px-6 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg hover:shadow-purple-500/50"
            >
              Employee Sign In
            </Link>
          </div>

          {/* Info Box */}
          <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-sm text-blue-300">
              💡 <strong>Multiple Authentication Methods:</strong> Choose the sign-in method that works best for your organization. Admin accounts created with username/password, or via Google OAuth.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 mt-6">
          <p>Protected by authentication • Legal Compliance RAG v1.0</p>
        </div>
      </div>
    </div>
  );
}

