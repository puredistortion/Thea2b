/**
 * Theme Constants for A2B Downloader
 * Defines the core theme variables and configurations
 */

export const THEMES = {
    LIGHT: 'light',
    DARK: 'dark'
};

export const THEME_COLORS = {
    [THEMES.LIGHT]: {
        '--primary-green': '#1DB954',
        '--primary-bg': '#FFFFFF',
        '--secondary-bg': '#F5F5F5',
        '--text-primary': '#333333',
        '--text-secondary': '#666666',
        '--border-color': '#E5E5E5',
        '--input-bg': '#FFFFFF',
        '--button-primary': '#1DB954',
        '--button-secondary': '#E5E5E5',
        '--button-danger': 'rgba(255, 59, 48, 0.15)',
        '--button-hover': '#1ed760',
        '--toast-bg': '#333333',
        '--progress-bg': 'rgba(29, 185, 84, 0.1)',
        '--progress-fill': '#1DB954'
    },
    [THEMES.DARK]: {
        '--primary-green': '#1DB954',
        '--primary-bg': '#121212',
        '--secondary-bg': '#282828',
        '--text-primary': '#FFFFFF',
        '--text-secondary': '#B3B3B3',
        '--border-color': 'rgba(255, 255, 255, 0.1)',
        '--input-bg': 'rgba(255, 255, 255, 0.1)',
        '--button-primary': '#1DB954',
        '--button-secondary': 'rgba(255, 255, 255, 0.1)',
        '--button-danger': 'rgba(255, 59, 48, 0.15)',
        '--button-hover': '#1ed760',
        '--toast-bg': '#282828',
        '--progress-bg': 'rgba(255, 255, 255, 0.1)',
        '--progress-fill': '#1DB954'
    }
};

export const LOCAL_STORAGE_KEY = 'a2b-theme';

export const THEME_TRANSITION = {
    duration: '0.2s',
    timing: 'ease'
};

export const SYSTEM_EVENTS = {
    THEME_CHANGE: 'theme-change'
};