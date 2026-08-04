import React, { useState } from 'react';
import { authService } from '../../../services/authService';
import Screen from '../primitives/Screen';
import Button from '../primitives/Button';
import IconButton from '../primitives/IconButton';
import Tabs from '../primitives/Tabs';
import { TextField } from '../primitives/Field';
import { cx } from '../primitives/cx';

interface AuthScreenProps {
  onComplete: (userId?: string) => void;
}

type AuthMode = 'login' | 'signup' | 'reset';

const BULLETS: ReadonlyArray<{ icon: string; title: string; body: string }> = [
  {
    icon: 'fa-brain',
    title: 'A living Game Master',
    body: 'An AI narrator that remembers your deeds and reacts to every choice.',
  },
  {
    icon: 'fa-image',
    title: 'Painterly worlds',
    body: 'Atmosphere art is summoned for every location your party visits.',
  },
  {
    icon: 'fa-users',
    title: 'Your legend persists',
    body: 'Cloud-saved chronicles, solo or side-by-side with your party.',
  },
];

/** V2 auth screen: brand panel + login/signup/reset form, with the anonymous wandering-stranger path. */
const AuthScreen: React.FC<AuthScreenProps> = ({ onComplete }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const switchMode = (key: string) => {
    setMode(key as AuthMode);
    setBanner(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setBanner(null);
    try {
      if (mode === 'reset') {
        const { error } = await authService.resetPasswordForEmail(email);
        if (error) {
          setBanner({ type: 'error', text: error.message });
        } else {
          setBanner({ type: 'success', text: 'Password reset link sent! Check your email.' });
        }
      } else if (mode === 'login') {
        const { session, error } = await authService.signIn(email, password);
        if (error) {
          setBanner({ type: 'error', text: error.message });
        } else if (session) {
          onComplete(session.user.id);
        }
      } else {
        const { session, error } = await authService.signUp(email, password);
        if (error) {
          setBanner({ type: 'error', text: error.message });
        } else if (session) {
          onComplete(session.user.id);
        } else {
          setMode('login');
          setBanner({ type: 'success', text: 'Account created! Please sign in.' });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error && err.message ? err.message : 'An unexpected error occurred';
      setBanner({ type: 'error', text: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen dots center>
      <div className="w-full max-h-[100dvh] overflow-y-auto v2-scrollbar px-4 py-10">
        <div className="w-full max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-center">
          {/* Brand panel */}
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight leading-tight mb-2">
                <span className="text-ember-500">Dice</span>
                <span className="text-parchment"> On Rails</span>
              </h1>
              <p className="font-display text-parchment-mute text-[11px] md:text-xs uppercase tracking-[0.25em]">
                The Infinite AI-Powered RPG Adventure
              </p>
            </div>
            <div className="flex flex-col gap-4">
              {BULLETS.map((b) => (
                <div key={b.title} className="flex items-start gap-3">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-arcane-500/10 border border-arcane-500/30 text-arcane-300 shrink-0">
                    <i className={cx('fas text-sm', b.icon)} aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-parchment">{b.title}</p>
                    <p className="text-xs text-parchment-mute leading-relaxed mt-0.5">{b.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Form card */}
          <div className="bg-obsidian-900/70 border border-white/[0.06] rounded-2xl p-6 md:p-8 shadow-2xl">
            <h2 className="font-display text-xl font-bold text-parchment tracking-wider text-center mb-5">
              Begin Your Chronicle
            </h2>
            <Tabs
              className="mb-5"
              active={mode}
              onChange={switchMode}
              items={[
                { key: 'login', label: 'Sign In', icon: 'fa-right-to-bracket' },
                { key: 'signup', label: 'Sign Up', icon: 'fa-user-plus' },
                { key: 'reset', label: 'Reset', icon: 'fa-key' },
              ]}
            />
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <TextField
                label="Email"
                type="email"
                icon="fa-envelope"
                placeholder="adventurer@example.com"
                value={email}
                onChange={setEmail}
              />
              {mode !== 'reset' && (
                <div>
                  <span className="block mb-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.15em] text-parchment-mute">
                    Password
                  </span>
                  <div className="relative">
                    <TextField
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={setPassword}
                      inputClassName="pr-11"
                    />
                    <IconButton
                      icon={showPassword ? 'fa-eye-slash' : 'fa-eye'}
                      tip={showPassword ? 'Hide password' : 'Show password'}
                      size="sm"
                      className="absolute right-1.5 top-[7px]"
                      onClick={() => setShowPassword((v) => !v)}
                    />
                  </div>
                </div>
              )}
              {banner && (
                <div
                  className={cx(
                    'flex items-start gap-2 p-3 rounded-lg text-sm border animate-fade-in',
                    banner.type === 'error'
                      ? 'bg-blood-950/40 text-blood-300 border-blood-500/40'
                      : 'bg-verdant-950/40 text-verdant-300 border-verdant-500/40',
                  )}
                >
                  <i
                    className={cx('fas mt-0.5 text-xs', banner.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check')}
                    aria-hidden="true"
                  />
                  <span>{banner.text}</span>
                </div>
              )}
              <Button type="submit" block loading={loading} icon={mode === 'reset' ? 'fa-paper-plane' : undefined}>
                {mode === 'reset' ? 'Send Reset Link' : mode === 'login' ? 'Enter the Realm' : 'Sign Up'}
              </Button>
            </form>
            <div className="mt-6 pt-6 border-t border-white/[0.06]">
              <p className="text-xs text-parchment-mute text-center mb-3 flex items-center justify-center gap-2">
                <i className="fas fa-user-secret text-parchment-faint" aria-hidden="true" />
                Play as a wandering stranger — local save only.
              </p>
              <Button variant="ghost" block onClick={() => onComplete()}>
                Continue Anonymously
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Screen>
  );
};

export default AuthScreen;
