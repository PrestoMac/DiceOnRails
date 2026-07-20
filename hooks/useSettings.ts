import { useState } from 'react';
import { AppSettings } from '../types';
import { setDebugMode } from '../utils/debug';

const DEFAULT_SETTINGS: AppSettings = {
    voiceName: 'Google UK English Male',
    rate: 1.3,
    pitch: 0.8,
    volume: 1.0,
    autoSpeak: false,
    enableAtmosphere: true,
    debugMode: false,
};

export const useSettings = () => {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settings, setSettings] = useState<AppSettings>(() => {
        const saved = localStorage.getItem('diceonrails_settings');
        const parsed = saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
        const merged = { ...DEFAULT_SETTINGS, ...parsed };
        setDebugMode(merged.debugMode);
        return merged;
    });

    const saveSettings = (newSettings: AppSettings) => {
        setDebugMode(newSettings.debugMode);
        setSettings(newSettings);
        localStorage.setItem('diceonrails_settings', JSON.stringify(newSettings));
        setSettingsOpen(false);
    };

    return {
        settings,
        settingsOpen,
        setSettingsOpen,
        saveSettings
    };
};
