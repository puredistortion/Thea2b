const BaseManager = require('./base-manager');

class ThemeManager extends BaseManager {
    constructor() {
        super();
        this.currentTheme = localStorage.getItem('theme') || 'light';
    }

    async init() {
        try {
            this.elements = this.validateElements({
                themeToggle: 'themeToggle'
            });

            this.applyTheme(this.currentTheme);
            this.bindEvents();
            this.initialized = true;
        } catch (error) {
            this.handleError(new Error('Failed to initialize ThemeManager: ' + error.message));
        }
    }

    bindEvents() {
        this.elements.themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        this.currentTheme = newTheme;
    }

    applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        this.updateThemeIcon(theme);
    }

    updateThemeIcon(theme) {
        this.elements.themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
        this.elements.themeToggle.setAttribute('aria-label', `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`);
    }
}

module.exports = new ThemeManager();