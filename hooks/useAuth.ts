import { useState, useEffect } from 'react';
import { authService } from '../services/authService';

/** Manages authentication state: loads session on mount and provides login/logout helpers. */
export const useAuth = () => {
    const [userId, setUserId] = useState<string | undefined>(undefined);

    useEffect(() => {
        (async () => {
            const session = await authService.getSession();
            if (session) {
                setUserId(session.user.id);
            }
        })();
    }, []);

    const handleLogout = async () => {
        if (confirm('Are you sure you want to log out? Unsaved progress in the current session might be lost.')) {
            await authService.signOut();
            setUserId(undefined);
            return true;
        }
        return false;
    };

    return { userId, setUserId, handleLogout };
};
