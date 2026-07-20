import { supabase } from './supabaseClient';
import { Session } from '@supabase/supabase-js';

/** Result of an authentication operation, containing the session, error, and auth mode. */
export interface AuthResult {
    session: Session | null;
    error: string | null;
    mode: 'anonymous' | 'supabase' | null;
}

/** Authentication service wrapping Supabase Auth for sign up, sign in, sign out, password management, and session retrieval. */
export const authService = {
    /** Creates a new user account with the given email and password. */
    async signUp(email: string, pass: string): Promise<{ error: Error | null }> {
        const { error } = await supabase.auth.signUp({
            email,
            password: pass,
        });
        return { error };
    },
    /** Signs in an existing user with email and password credentials. */
    async signIn(email: string, pass: string): Promise<{ session: Session | null; error: Error | null }> {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: pass,
        });
        return { session: data.session, error };
    },
    /** Signs the current user out. */
    async signOut() {
        await supabase.auth.signOut();
    },
    /** Retrieves the current session, or null if not authenticated. */
    async getSession(): Promise<Session | null> {
        const { data } = await supabase.auth.getSession();
        return data.session;
    },
    /** Updates the current user's password. */
    async updatePassword(newPassword: string): Promise<{ error: Error | null }> {
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });
        return { error };
    },
    /** Sends a password-reset email to the given address. */
    async resetPasswordForEmail(email: string): Promise<{ error: Error | null }> {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
        });
        return { error };
    }
};
