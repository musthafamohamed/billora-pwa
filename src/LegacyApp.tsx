import App from './App';
import { StoreProvider } from './lib/store';
/** Loaded only by the explicit development-only legacy build. Never mounted
 * by authentication or as a fallback from a failed sign-in. */
export default function LegacyApp() { return <StoreProvider><App /></StoreProvider>; }
