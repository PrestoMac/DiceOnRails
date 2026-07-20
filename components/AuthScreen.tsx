import React, { useState } from 'react';
import { authService } from '../services/authService';

interface AuthScreenProps {
  onComplete: (userId?: string) => void;
}

const inputCls = "w-full bg-stone-950 border border-stone-800 rounded p-3 text-stone-200 focus:border-amber-600 focus:outline-none transition-colors";
const linkCls = "hover:text-amber-500 transition-colors uppercase tracking-wider";
const labelCls = "block text-stone-400 text-xs uppercase font-bold tracking-wider mb-1";

/** Login/signup form with email/password authentication and anonymous play option. */
const AuthScreen: React.FC<AuthScreenProps> = ({ onComplete }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [isResetMode, setIsResetMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const clearMsg = () => setMessage(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); clearMsg();
    try {
      if (isResetMode) {
        const { error } = await authService.resetPasswordForEmail(email);
        if (error) { setMessage({ type: 'error', text: error.message }); } else { setMessage({ type: 'success', text: 'Password reset link sent! Check your email.' }); }
      } else if (isLogin) {
        const { session, error } = await authService.signIn(email, password);
        if (error) { setMessage({ type: 'error', text: error.message }); } else if (session) { onComplete(session.user.id); }
      } else {
        const { session, error } = await authService.signUp(email, password);
        if (error) {
          setMessage({ type: 'error', text: error.message });
        } else if (session) {
          onComplete(session.user.id);
        } else {
          setIsLogin(true);
          setMessage({ type: 'success', text: 'Account created! Please sign in.' });
        }
      }
    } catch (err: unknown) { setMessage({ type: 'error', text: (err as Error).message || 'An unexpected error occurred' }); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-950 relative overflow-hidden p-4">
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#444 1px, transparent 1px)', backgroundSize: '30px 30px' }} />
      <div className="w-full max-w-md bg-stone-900/80 backdrop-blur-xl border border-stone-800 rounded-2xl shadow-2xl p-8 relative z-10 animate-in fade-in zoom-in-95 duration-500">
        <div className="text-center mb-8">
          <h1 className="fantasy-font text-4xl font-bold text-amber-600 tracking-tight mb-2">Dice<span className="text-stone-100">OnRails</span></h1>
          <p className="text-stone-500 text-sm tracking-widest uppercase">Begin your chronicle</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Email</label>
            <input type="email" required className={inputCls} placeholder="adventurer@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          {!isResetMode && <div>
            <label className={labelCls}>Password</label>
            <input type="password" required className={inputCls} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
          </div>}
          {message && <div className={`p-3 rounded text-sm ${message.type === 'error' ? 'bg-red-900/30 text-red-400 border border-red-900' : 'bg-green-900/30 text-green-400 border border-green-900'}`}>{message.text}</div>}
          <button type="submit" disabled={loading} className="w-full py-3 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white rounded font-bold tracking-wide transition-all shadow-lg shadow-amber-900/20">
            {loading ? <i className="fas fa-spinner fa-spin"></i> : isResetMode ? 'Send Reset Link' : isLogin ? 'Enter the Realm' : 'Sign Up'}
          </button>
        </form>
        <div className="mt-6 flex items-center justify-between text-xs text-stone-500 font-medium">
          {isResetMode ? <button type="button" onClick={() => { setIsResetMode(false); clearMsg(); }} className={linkCls}>Back to Login</button> : <>
            <button type="button" onClick={() => { setIsLogin(!isLogin); clearMsg(); }} className={linkCls}>{isLogin ? 'Create Account' : 'Back to Login'}</button>
            {isLogin && <button type="button" onClick={() => { setIsResetMode(true); clearMsg(); }} className={linkCls}>Forgot Password?</button>}
          </>}
        </div>
        <div className="mt-8 pt-6 border-t border-stone-800">
          <button type="button" onClick={() => onComplete(undefined)} className="w-full py-3 border border-stone-700 hover:border-stone-500 text-stone-400 hover:text-stone-200 rounded font-bold tracking-wide transition-all uppercase text-xs">Continue Anonymously</button>
          <p className="mt-2 text-center text-[10px] text-stone-600">Local save only. Progress may be lost.</p>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
