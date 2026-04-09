import { useAuthStore } from '@store/authStore';
import { Plane, Wrench, LayoutDashboard, LogOut, Settings } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/aircraft', label: 'Aeronaves', icon: Plane },
  { to: '/components', label: 'Componentes (EQ)', icon: Settings },
  { to: '/compliance', label: 'Cumplimientos', icon: Wrench },
];

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-64 bg-brand-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-brand-800">
          <h1 className="text-xl font-bold">Griselle</h1>
          <p className="text-xs text-brand-300 mt-1 truncate">{user?.name}</p>
          <span className="inline-block mt-1 text-xs bg-brand-700 text-brand-200 px-2 py-0.5 rounded">{user?.role}</span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-brand-700 text-white' : 'text-brand-200 hover:bg-brand-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-brand-800">
          <button onClick={logout} className="flex items-center gap-2 text-brand-300 hover:text-white text-sm transition-colors">
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </main>
    </div>
  );
}
