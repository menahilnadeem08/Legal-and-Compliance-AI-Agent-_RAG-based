'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSession, signOut } from 'next-auth/react';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [isEmployee, setIsEmployee] = useState(false);
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    // If there is a local JWT + user, treat as employee login
    if (token && userStr) {
      setIsEmployee(true);
      try {
        const userData = JSON.parse(userStr);
        setUserName(userData.username || userData.name || 'Employee');
      } catch {
        setUserName('Employee');
      }
    } else {
      setIsEmployee(false);
    }
  }, []);

  const adminNavItems = [
    { href: '/', label: 'Home', icon: '🏠' },
    { href: '/upload', label: 'Upload', icon: '📤' },
    { href: '/document', label: 'Documents', icon: '📚' },
    { href: '/chat', label: 'Chat', icon: '💬' },
    { href: '/profile', label: 'Profile', icon: '👤' },
    { href: '/admin', label: 'Admin', icon: '⚙️' },
  ];

  const employeeNavItems = [
    { href: '/', label: 'Home', icon: '🏠' },
    { href: '/document', label: 'Documents', icon: '📚' },
    { href: '/chat', label: 'Chat', icon: '💬' },
    { href: '/profile', label: 'Profile', icon: '👤' },
  ];

  const navItems = isEmployee ? employeeNavItems : adminNavItems;

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

  return (
    <nav className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 backdrop-blur-md border-b border-slate-600/50 sticky top-0 z-50 shadow-lg">
      <div className="max-w-full mx-auto px-10 py-5">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
              ⚖️
            </div>
            <span className="font-bold text-white text-lg hidden sm:inline">Legal Compliance</span>
          </Link>

          {/* Navigation Links */}
          <div className="flex items-center gap-8">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-6 py-3 rounded-lg transition-all font-semibold text-base ${
                    isActive
                      ? 'bg-blue-600 text-white border border-blue-500 shadow-lg shadow-blue-500/40'
                      : 'text-gray-300 hover:text-white hover:bg-blue-600/20 border border-slate-600/30 hover:border-blue-500/50 hover:shadow-md hover:shadow-blue-500/20'
                  }`}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}

            {/* User Profile & Logout */}
            <div className="flex items-center gap-4">
              {isEmployee && userName && (
                <div className="text-sm text-gray-300">
                  <span className="hidden sm:inline">{userName}</span>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-base transition-all border border-red-500 hover:shadow-md hover:shadow-red-500/20"
              >
                <span className="hidden sm:inline">Logout</span>
                <span className="sm:hidden">🚪</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
