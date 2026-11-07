import { useCallback, useEffect, useState } from 'react';
import { useStore } from './lib/store';
import BottomNav from './components/BottomNav';
import Dashboard from './pages/Dashboard';
import Invoices from './pages/Invoices';
import InvoiceDetail from './pages/InvoiceDetail';
import InvoiceEditor from './pages/InvoiceEditor';
import Customers from './pages/Customers';
import Products from './pages/Products';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Welcome from './pages/Welcome';

export type Route = 'home' | 'invoices' | 'invoice-detail' | 'invoice-new' | 'customers' | 'products' | 'reports' | 'settings' | 'welcome';

function parseHash(): { route: Route; id?: string } {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [path, id] = h.split('/');
  switch (path) {
    case 'invoices': return id ? { route: 'invoice-detail', id } : { route: 'invoices' };
    case 'invoices-new': return { route: 'invoice-new', id };
    case 'customers': return { route: 'customers' };
    case 'products': return { route: 'products' };
    case 'reports': return { route: 'reports' };
    case 'settings': return { route: 'settings' };
    case 'welcome': return { route: 'welcome' };
    default: return { route: 'home' };
  }
}

export default function App() {
  const { loaded, welcomed, profile } = useStore();
  const [current, setCurrent] = useState(parseHash);

  useEffect(() => {
    const onHash = () => setCurrent(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((r: Route, id?: string) => {
    const map: Record<Route, string> = {
      home: '#/', invoices: '#/invoices', 'invoice-detail': `#/invoices/${id ?? ''}`,
      'invoice-new': id ? `#/invoices-new/${id}` : '#/invoices-new',
      customers: '#/customers', products: '#/products', reports: '#/reports', settings: '#/settings', welcome: '#/welcome',
    };
    window.location.hash = map[r];
  }, []);

  // First-run welcome: show it once, only when no business name is set
  // and the user has not already skipped/completed it.
  useEffect(() => {
    if (loaded && !welcomed && !profile.businessName && current.route !== 'welcome') {
      navigate('welcome');
    }
  }, [loaded, welcomed, profile.businessName, current.route, navigate]);

  if (!loaded) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[520px] items-center justify-center bg-white dark:bg-slate-950 p-6">
        <p className="text-lg font-semibold text-slate-600 dark:text-slate-400">Loading Simple Bill…</p>
      </div>
    );
  }

  const showNav = current.route !== 'welcome';
  const showFab = current.route !== 'invoice-new' && current.route !== 'welcome';

  return (
    <div className="mx-auto min-h-screen max-w-[520px] bg-white dark:bg-slate-950 shadow-sm sm:border-x sm:border-slate-200 dark:border-slate-700">
      <main className="px-4 pb-40 pt-5">
        {current.route === 'home' && <Dashboard navigate={navigate} />}
        {current.route === 'invoices' && <Invoices navigate={navigate} />}
        {current.route === 'invoice-detail' && current.id && <InvoiceDetail id={current.id} navigate={navigate} />}
        {current.route === 'invoice-new' && <InvoiceEditor id={current.id} navigate={navigate} />}
        {current.route === 'customers' && <Customers navigate={navigate} />}
        {current.route === 'products' && <Products />}
        {current.route === 'reports' && <Reports />}
        {current.route === 'settings' && <Settings />}
        {current.route === 'welcome' && <Welcome navigate={navigate} />}
      </main>

      {showFab && (
        <button
          type="button"
          onClick={() => navigate('invoice-new')}
          aria-label="Create invoice"
          className="fixed bottom-[76px] right-4 z-40 flex min-h-[56px] min-w-[56px] items-center gap-2 rounded-full bg-teal-700 px-5 py-3 text-base font-bold text-white shadow-lg sm:right-[calc(50%-240px)]"
        >
          <span aria-hidden="true" className="text-xl">＋</span> Create Invoice
        </button>
      )}
      {showNav && <BottomNav route={current.route} navigate={navigate} />}
    </div>
  );
}
