'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { requestOtp, verifyOtp } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/';
  const { setSession } = useAuth();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onRequest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await requestOtp(phone);
      setStep('code');
      if (res.devCode) {
        setDevCode(res.devCode);
        setCode(res.devCode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send OTP');
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const tokens = await verifyOtp(phone, code, name || undefined);
      setSession(tokens.accessToken, tokens.refreshToken, tokens.user);
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired code');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-2 text-2xl font-bold">Login / Sign up</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Enter your mobile number and we&apos;ll send a one-time code.
      </p>

      {step === 'phone' ? (
        <form onSubmit={onRequest} className="flex flex-col gap-3">
          <input
            type="tel"
            inputMode="numeric"
            placeholder="Mobile number (10 digits)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 outline-none focus:border-violet-500"
            required
          />
          <input
            type="text"
            placeholder="Your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 outline-none focus:border-violet-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-violet-600 px-4 py-2.5 font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Send OTP
          </button>
        </form>
      ) : (
        <form onSubmit={onVerify} className="flex flex-col gap-3">
          <input
            type="text"
            inputMode="numeric"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 tracking-widest outline-none focus:border-violet-500"
            required
          />
          {devCode && (
            <p className="text-xs text-amber-400">Dev mode: your code is {devCode} (pre-filled).</p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-violet-600 px-4 py-2.5 font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            Verify & continue
          </button>
          <button
            type="button"
            onClick={() => setStep('phone')}
            className="text-sm text-neutral-400 hover:text-neutral-200"
          >
            ← Change number
          </button>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<p className="text-neutral-400">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
