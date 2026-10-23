'use client';

import { useEffect, useState } from 'react';
import { Check, Download, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { Button } from './ui/Button';
import './app-install.css';

interface InstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Optional installation lives in Tools; it never interrupts model exploration. */
export function AppInstall() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [platform, setPlatform] = useState<'ios' | 'other' | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)');
    const appleNavigator = navigator as Navigator & { standalone?: boolean };
    setInstalled(standalone.matches || appleNavigator.standalone === true);
    setPlatform(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        ? 'ios'
        : 'other',
    );
    function offered(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    }
    function accepted() {
      setInstalled(true);
      setPrompt(null);
      setMessage('');
    }
    function displayChanged(event: MediaQueryListEvent) {
      if (event.matches) accepted();
    }
    window.addEventListener('beforeinstallprompt', offered);
    window.addEventListener('appinstalled', accepted);
    standalone.addEventListener('change', displayChanged);
    // Only an offline document is cached. Application code and model files use
    // their normal network/cache behavior, so releases cannot become stale here.
    if (
      process.env.NODE_ENV === 'production' &&
      window.isSecureContext &&
      'serviceWorker' in navigator
    ) {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {
          // Storage restrictions must not stop the explorer or installation UI.
        });
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', offered);
      window.removeEventListener('appinstalled', accepted);
      standalone.removeEventListener('change', displayChanged);
    };
  }, []);

  async function install() {
    if (!prompt || busy) return;
    const invitation = prompt;
    setPrompt(null); // Browser invitations can only be used once.
    setBusy(true);
    try {
      const choice = await invitation.prompt();
      setMessage(
        choice.outcome === 'accepted'
          ? 'Follow your browser’s instructions to finish installing.'
          : 'You can install later from your browser’s menu.',
      );
    } catch {
      setMessage('Use your browser’s menu to install or add a home-screen shortcut.');
    } finally {
      setBusy(false);
    }
  }

  if (!platform) return null;
  return (
    <div className="app-install">
      {installed ? (
        <p className="app-install-status">
          <Check size={16} aria-hidden="true" /> App installed
        </p>
      ) : prompt || busy ? (
        <Button variant="ghost" className="app-install-button" onClick={install} disabled={busy}>
          <Download size={16} aria-hidden="true" />
          {busy ? 'Opening installer…' : 'Install app'}
        </Button>
      ) : (
        <details className="app-install-guide">
          <summary>
            <Smartphone size={16} aria-hidden="true" />
            {platform === 'ios' ? 'Add to Home Screen' : 'Use as an app'}
          </summary>
          <div>
            {platform === 'ios' ? (
              <p>
                In your browser, open <strong>Share</strong>, choose{' '}
                <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>. If offered, keep{' '}
                <strong>Open as Web App</strong> enabled.
              </p>
            ) : (
              <p>
                Open your browser’s menu and look for <strong>Install app</strong> or{' '}
                <strong>Add to Home Screen</strong>. Availability depends on your browser.
              </p>
            )}
            <p>Open from your home screen for a dedicated explorer window.</p>
            <p>An internet connection is needed to load models.</p>
          </div>
        </details>
      )}
      {message && !installed && (
        <p className="app-install-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

/** Place in the shell so connection changes remain visible outside the Tools menu. */
export function ConnectionStatus({ className = '' }: { className?: string }) {
  const [status, setStatus] = useState<'online' | 'offline' | 'reconnected'>('online');
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    function offline() {
      clearTimeout(timeout);
      setStatus('offline');
    }
    function online() {
      setStatus('reconnected');
      clearTimeout(timeout);
      timeout = setTimeout(() => setStatus('online'), 4000);
    }
    if (!navigator.onLine) offline();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, []);
  return (
    <div
      className={`connection-status ${className}`}
      role="status"
      hidden={status === 'online'}
      data-connection={status}
    >
      {status === 'offline' ? (
        <WifiOff size={16} aria-hidden="true" />
      ) : (
        <Wifi size={16} aria-hidden="true" />
      )}
      <span>
        {status === 'offline'
          ? 'You’re offline. Loaded models remain available.'
          : status === 'reconnected'
            ? 'Connection restored.'
            : ''}
      </span>
    </div>
  );
}
