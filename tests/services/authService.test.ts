import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSignUp = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockUpdateUser = vi.fn();
const mockResetPasswordForEmail = vi.fn();

vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      getSession: mockGetSession,
      updateUser: mockUpdateUser,
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  },
}));

const { authService } = await import('../../services/authService');

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signUp', () => {
    it('calls supabase.auth.signUp with email and password', async () => {
      const fakeSession = { user: { id: 'user-1' } };
      mockSignUp.mockResolvedValue({ data: { session: fakeSession }, error: null });
      const result = await authService.signUp('test@test.com', 'password123');
      expect(mockSignUp).toHaveBeenCalledWith({ email: 'test@test.com', password: 'password123' });
      expect(result.error).toBeNull();
      expect(result.session).toEqual(fakeSession);
    });

    it('returns null session when supabase provides none', async () => {
      mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
      const result = await authService.signUp('test@test.com', 'password123');
      expect(result.error).toBeNull();
      expect(result.session).toBeNull();
    });

    it('returns error on signup failure', async () => {
      mockSignUp.mockResolvedValue({ data: { session: null }, error: new Error('User already exists') });
      const result = await authService.signUp('exists@test.com', 'pass');
      expect(result.error).toBeTruthy();
      expect(result.session).toBeNull();
    });
  });

  describe('signIn', () => {
    it('calls signInWithPassword and returns session', async () => {
      const fakeSession = { user: { id: 'user-1' } };
      mockSignInWithPassword.mockResolvedValue({ data: { session: fakeSession }, error: null });
      const result = await authService.signIn('a@b.com', 'pass');
      expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pass' });
      expect(result.session).toEqual(fakeSession);
    });

    it('handles signin errors', async () => {
      mockSignInWithPassword.mockResolvedValue({ data: { session: null }, error: new Error('Invalid credentials') });
      const result = await authService.signIn('bad@creds.com', 'wrong');
      expect(result.error).toBeTruthy();
      expect(result.session).toBeNull();
    });
  });

  describe('signOut', () => {
    it('calls supabase.auth.signOut', async () => {
      mockSignOut.mockResolvedValue(undefined);
      await authService.signOut();
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('getSession', () => {
    it('returns the current session', async () => {
      const fakeSession = { user: { id: 'u1' } };
      mockGetSession.mockResolvedValue({ data: { session: fakeSession } });
      const session = await authService.getSession();
      expect(session).toEqual(fakeSession);
    });

    it('returns null when no session', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      const session = await authService.getSession();
      expect(session).toBeNull();
    });
  });

  describe('updatePassword', () => {
    it('calls updateUser with new password', async () => {
      mockUpdateUser.mockResolvedValue({ error: null });
      const result = await authService.updatePassword('newPass123');
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newPass123' });
      expect(result.error).toBeNull();
    });

    it('handles password update errors', async () => {
      mockUpdateUser.mockResolvedValue({ error: new Error('Weak password') });
      const result = await authService.updatePassword('short');
      expect(result.error).toBeTruthy();
    });
  });

  describe('resetPasswordForEmail', () => {
    it('calls resetPasswordForEmail with redirectTo', async () => {
      Object.defineProperty(window, 'location', { value: { origin: 'http://localhost' }, writable: true });
      mockResetPasswordForEmail.mockResolvedValue({ error: null });
      const result = await authService.resetPasswordForEmail('test@test.com');
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith('test@test.com', {
        redirectTo: 'http://localhost',
      });
      expect(result.error).toBeNull();
    });

    it('handles password reset errors', async () => {
      mockResetPasswordForEmail.mockResolvedValue({ error: new Error('Email not found') });
      const result = await authService.resetPasswordForEmail('ghost@test.com');
      expect(result.error).toBeTruthy();
    });
  });
});
