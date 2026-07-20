import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockGetSession = vi.fn();
const mockSignOut = vi.fn();

vi.mock('../../services/authService', () => ({
  authService: {
    getSession: mockGetSession,
    signOut: mockSignOut,
  },
}));

const { useAuth } = await import('../../hooks/useAuth');

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with undefined userId', () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    const { result } = renderHook(() => useAuth());
    expect(result.current.userId).toBeUndefined();
  });

  it('sets userId when session exists', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.userId).toBe('user-1');
    });
  });

  it('stays undefined when no session', async () => {
    mockGetSession.mockResolvedValue(null);
    const { result } = renderHook(() => useAuth());

    await waitFor(() => {
      expect(result.current.userId).toBeUndefined();
    });
  });

  it('handleLogout signs out and clears userId on confirm', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-1' } });
    vi.stubGlobal('confirm', vi.fn(() => true));
    mockSignOut.mockResolvedValue(undefined);

    const { result } = await waitFor(() => {
      const hook = renderHook(() => useAuth());
      return hook;
    });

    await waitFor(() => {
      expect(result.current.userId).toBe('user-1');
    });

    let loggedOut: boolean | undefined;
    await act(async () => {
      loggedOut = await result.current.handleLogout();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(loggedOut).toBe(true);
    expect(result.current.userId).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('handleLogout does nothing on cancel', async () => {
    mockGetSession.mockResolvedValue(null);
    vi.stubGlobal('confirm', vi.fn(() => false));

    const { result } = renderHook(() => useAuth());

    let loggedOut: boolean | undefined;
    await act(async () => {
      loggedOut = await result.current.handleLogout();
    });

    expect(mockSignOut).not.toHaveBeenCalled();
    expect(loggedOut).toBe(false);
    vi.unstubAllGlobals();
  });
});
