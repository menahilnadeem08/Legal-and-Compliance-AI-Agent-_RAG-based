'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { isEmployeeUser, clearAllAuth } from '../utils/auth';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const [isEmployee, setIsEmployee] = useState(false);
  const [userName, setUserName] = useState<string>('');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (isEmployeeUser()) {
      setIsEmployee(true);
      try {
        const userData = JSON.parse(localStorage.getItem('user') || '{}');
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
    try {
      // Call backend to invalidate session
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout API call failed:', error);
      // Continue with local cleanup even if API fails
    }
    
    // Clear local auth state
    clearAllAuth();
    await signOut({ redirect: false });
    router.push('/auth/login');
  };

  const handleNavigation = (href: string) => {
    router.push(href);
  };

  return (
    <nav className="flex-shrink-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 backdrop-blur-md border-b border-slate-600/30 shadow-xl w-full">
      {/* Navbar Container */}
      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-5">
        <div className="flex items-center justify-between gap-6 sm:gap-8">
          {/* Logo & Brand - Left */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity flex-shrink-0">
            {/* Logo Icon */}
            <div className="w-11 h-11 sm:w-12 sm:h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-lg sm:text-xl shadow-lg hover:shadow-blue-500/30 transition-shadow">
              ⚖️
            </div>
            {/* Brand Text */}
            <span className="font-bold text-white text-sm sm:text-lg hidden sm:inline leading-tight">Legal Compliance</span>
          </Link>

          {/* Right Section - All Buttons Right-Aligned */}
          <div className="flex items-center gap-3 sm:gap-4 ml-auto">
            {/* Nav Buttons */}
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <button
                  key={item.href}
                  onClick={() => handleNavigation(item.href)}
                  className={`inline-flex items-center justify-center h-11 sm:h-12 px-4 sm:px-5 rounded-xl transition-all font-semibold text-sm sm:text-base whitespace-nowrap border leading-tight cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/40'
                      : 'text-gray-300 bg-slate-700/40 border-slate-600/40 hover:text-white hover:bg-blue-600/30 hover:border-blue-500/50'
                  }`}
                >
                  <span className="text-lg w-6 h-6 flex items-center justify-center flex-shrink-0">{item.icon}</span>
                  <span className="hidden lg:inline ml-2">{item.label}</span>
                </button>
              );
            })}
            
            {/* User Profile Name Button */}
            {isEmployee && userName && (
              <button
                onClick={() => handleNavigation('/profile')}
                className="inline-flex items-center justify-center h-11 sm:h-12 px-4 sm:px-5 rounded-xl border border-slate-600/40 bg-slate-700/40 text-sm sm:text-base text-gray-300 whitespace-nowrap leading-tight cursor-pointer hover:text-white hover:bg-slate-600/50 hover:border-slate-500/50 transition-all"
              >
                {userName}
              </button>
            )}
            
            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center h-11 sm:h-12 px-4 sm:px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm sm:text-base transition-all border border-red-500 hover:shadow-md hover:shadow-red-500/30 whitespace-nowrap leading-tight cursor-pointer"
            >
              <span className="text-lg w-6 h-6 flex items-center justify-center flex-shrink-0">🚪</span>
              <span className="hidden sm:inline ml-2">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
