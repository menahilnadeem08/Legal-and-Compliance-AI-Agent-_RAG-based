'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Home', icon: '🏠' },
    { href: '/upload', label: 'Upload', icon: '📤' },
    { href: '/documents', label: 'Documents', icon: '📚' },
    { href: '/chat', label: 'Chat', icon: '💬' },
  ];

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
          </div>
        </div>
      </div>
    </nav>
  );
}
