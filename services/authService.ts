import { supabase } from './supabaseClient';
import { Session } from '@supabase/supabase-js';

export interface AuthResult {
    session: Session | null;
    error: string | null;
    mode: 'anonymous' | 'supabase' | null;
}

export const authService = {
    async signUp(email: string, pass: string): Promise<{ error: any }> {
        const { error } = await supabase.auth.signUp({
            email,
            password: pass,
        });
        return { error };
    },
    async signIn(email: string, pass: string): Promise<{ session: Session | null; error: any }> {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: pass,
        });
        return { session: data.session, error };
    },
    async signOut() {
        await supabase.auth.signOut();
    },
    async getSession(): Promise<Session | null> {
        const { data } = await supabase.auth.getSession();
        return data.session;
    },
    async updatePassword(newPassword: string): Promise<{ error: any }> {
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });
        return { error };
    },
    async resetPasswordForEmail(email: string): Promise<{ error: any }> {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
        });
        return { error };
    }
};
