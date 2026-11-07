import type { Route } from '../App';
import { Icon, type IconName } from './Icon';

const items: { key: Route; label: string; icon: IconName }[] = [
  { key: 'home', label: 'Home', icon: 'house' },
  { key: 'invoices', label: 'Invoices', icon: 'fileText' },
  { key: 'customers', label: 'Customers', icon: 'users' },
  { key: 'products', label: 'Products', icon: 'package' },
  { key: 'reports', label: 'Reports', icon: 'chart' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

export default function BottomNav({ route, navigate }: { route: Route; navigate: (r: Route, id?: string) => void }) {
  const active = (r: Route) =>
    r === 'home' ? route === 'home' : r === 'invoices' ? route === 'invoices' || route === 'invoice-detail' || route === 'invoice-new' : route === r;
  return (
    <nav aria-label="Main navigation" className="sb-nav fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[520px] border-t pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-6">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => navigate(it.key)}
            aria-current={active(it.key) ? 'page' : undefined}
            className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-xs transition-colors ${active(it.key) ? 'bg-black/[.04] font-semibold text-[#0b0b0c] dark:bg-white/[.1] dark:text-white' : 'font-medium text-[#86868b] dark:text-[#a1a1a6]'}`}
          >
            <Icon name={it.icon} size={23} className="shrink-0" />
            {it.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
