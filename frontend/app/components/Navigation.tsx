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

  const handleNavigation = (href: string) => {
    router.push(href);
  };

  return (
    <nav className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 backdrop-blur-md border-b border-slate-600/50 sticky top-0 z-50 shadow-lg w-full">
      <div className="px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          {/* Logo on Left */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-90 transition-opacity flex-shrink-0">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-lg">
              ⚖️
            </div>
            <span className="font-bold text-white text-sm sm:text-base hidden sm:inline">Legal Compliance</span>
          </Link>

          {/* All Buttons Right-Aligned */}
          <div className="flex items-center gap-2 ml-auto h-10">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <button
                  key={item.href}
                  onClick={() => handleNavigation(item.href)}
                  className={`inline-flex items-center justify-center h-10 px-3 sm:px-4 rounded-lg transition-all font-semibold text-xs sm:text-sm whitespace-nowrap border leading-none cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/40'
                      : 'text-gray-300 bg-slate-700/30 border-slate-600/50 hover:text-white hover:bg-blue-600/30 hover:border-blue-500/50'
                  }`}
                >
                  <span className="text-base w-6 h-6 flex items-center justify-center flex-shrink-0">{item.icon}</span>
                  <span className="hidden md:inline ml-1">{item.label}</span>
                </button>
              );
            })}
            
            {/* User Profile Name Button */}
            {isEmployee && userName && (
              <button
                onClick={() => handleNavigation('/profile')}
                className="inline-flex items-center justify-center h-10 px-3 sm:px-4 rounded-lg border border-slate-600/50 bg-slate-700/30 text-xs sm:text-sm text-gray-300 whitespace-nowrap leading-none cursor-pointer hover:bg-blue-600/30 hover:border-blue-500/50 transition-all"
              >
                {userName}
              </button>
            )}
            
            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center h-10 px-3 sm:px-4 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs sm:text-sm transition-all border border-red-500 hover:shadow-md hover:shadow-red-500/20 whitespace-nowrap leading-none cursor-pointer"
            >
              <span className="text-base w-6 h-6 flex items-center justify-center flex-shrink-0">🚪</span>
              <span className="hidden sm:inline ml-1">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
