import { useInstall } from '../lib/useInstall';
import { btnPrimary } from './ui';
import { Icon } from './Icon';

function Check({ ok, label, neutralLabel }: { ok: boolean; label: string; neutralLabel?: string }) {
  // Some rows are not failures when false (e.g. "not installed yet" is the
  // normal state before installing), so show those neutrally, not as red Fail.
  if (!ok && neutralLabel) {
    return (
      <li className="flex items-center gap-2 text-sm">
        <Icon name="x" size={15} className="text-slate-400" />
        <span className="text-slate-700 dark:text-slate-200">{label}</span>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{neutralLabel}</span>
      </li>
    );
  }
  return (
    <li className="flex items-center gap-2 text-sm">
      <Icon name={ok ? 'check' : 'x'} size={17} className={ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'} />
      <span className="text-slate-700 dark:text-slate-200">{label}</span>
      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{ok ? 'Pass' : 'Fail'}</span>
    </li>
  );
}

/** Full install section for Settings: real Install button + live diagnostics. */
export default function InstallSection() {
  const { canInstall, isInstalled, diagnostics, blocker, installOutcome, promptInstall } = useInstall();

  return (
    <section aria-label="Install app" className="rounded-2xl border border-teal-200 bg-teal-50 p-4 dark:border-teal-800 dark:bg-teal-900/40">
      <h2 className="flex items-center gap-2 text-lg font-bold text-teal-900 dark:text-teal-100"><Icon name="smartphone" /> Install app</h2>
      <p className="mt-1 text-sm text-teal-900 dark:text-teal-100">
        Install Simple Bill on your phone&apos;s home screen so it opens full-screen like an app and works offline after the first load.
      </p>

      {isInstalled ? (
        <p role="status" className="mt-3 rounded-xl bg-emerald-100 p-3 text-sm font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
          <span className="flex items-center gap-2"><Icon name="check" /> Already installed — you are running the installed app.</span>
        </p>
      ) : (
        <button type="button" className={`${btnPrimary} mt-3 w-full`} disabled={!canInstall} onClick={() => { void promptInstall(); }}>
          <><Icon name="download" /> Install Simple Bill</>
        </button>
      )}
      {installOutcome && <p role="status" className="mt-2 text-sm text-teal-900 dark:text-teal-100">{installOutcome}</p>}
      {!isInstalled && blocker && <p role="status" className="mt-2 text-sm text-slate-600 dark:text-slate-400">{blocker}</p>}

      <h3 className="mt-4 text-sm font-bold text-teal-900 dark:text-teal-100">Install checks (checked in this browser)</h3>
      <ul className="mt-2 space-y-1">
        <Check ok={diagnostics.secure} label="Secure connection (HTTPS or localhost)" />
        <Check ok={diagnostics.serviceWorker} label="Service worker registered" />
        <Check ok={diagnostics.manifest} label="App manifest present" />
        <Check ok={diagnostics.installed} label="Already installed" neutralLabel="Not installed yet" />
        <Check ok={diagnostics.promptAvailable} label="Browser install prompt available" neutralLabel="Not offered yet" />
      </ul>

      <div className="mt-3 space-y-2 text-sm text-teal-900 dark:text-teal-100">
        <p>
          <strong>This address cannot be installed:</strong> Chrome requires HTTPS or localhost. A plain-HTTP
          LAN address (<code>192.168.x.x:5173</code>) will always show Secure connection: Fail and Service
          worker: Fail, no matter what the app code does.
        </p>
        <p><strong>Working path A — deploy to free HTTPS hosting (recommended):</strong> on the laptop run
          <code> npm run build</code>, then drag the <code>dist</code> folder onto Netlify Drop, open the
          https URL on your phone — then Install and Share will both work.</p>
        <p><strong>Working path B — temporary test only:</strong> expose your laptop over HTTPS with a tunnel
          (e.g. <code>cloudflared tunnel --url http://localhost:5173</code>, or <code>ngrok http 5173</code>)
          and open the https tunnel URL on your phone — the URL changes each run.</p>
        <p>
          <strong>Note on the dev-server warning:</strong> the “PWA generateSW, precache 1 entries, glob
          pattern doesn&apos;t match” warning is a dev-mode artefact only — the production build precaches
          14 entries correctly — and it is <em>not</em> the reason install fails; the secure-context failure
          above is.
        </p>
      </div>
      <p className="mt-2 text-sm text-teal-900 dark:text-teal-100">
        <strong>Manual install:</strong> Android Chrome → Menu ⋮ → Add to Home screen → Install.
        {' '}iPhone Safari → Share ⎋ → Add to Home Screen → Add. Installation depends on your phone and browser;
        the button does not work on every browser or phone.
      </p>
    </section>
  );
}
