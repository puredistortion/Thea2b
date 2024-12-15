// Theme management system
function initializeTheme() {
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.body.setAttribute('data-theme', currentTheme);
    updateThemeColors(currentTheme);
}

function toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeColors(newTheme);
}

function updateThemeColors(theme) {
    const root = document.documentElement;
    if (theme === 'dark') {
        root.style.setProperty('--bg-color', '#1a1a1a');
        root.style.setProperty('--text-color', '#ffffff');
        root.style.setProperty('--input-bg', '#2d2d2d');
        root.style.setProperty('--border-color', '#404040');
        root.style.setProperty('--button-bg', '#4a4a4a');
        root.style.setProperty('--button-hover', '#5a5a5a');
    } else {
        root.style.setProperty('--bg-color', '#ffffff');
        root.style.setProperty('--text-color', '#333333');
        root.style.setProperty('--input-bg', '#ffffff');
        root.style.setProperty('--border-color', '#cccccc');
        root.style.setProperty('--button-bg', '#76c7c0');
        root.style.setProperty('--button-hover', '#5fb5ae');
    }
}

// Toast notification system
function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// URL validation function
function isValidURL(url) {
    try {
        new URL(url);
        return true;
    } catch (error) {
        console.error("Invalid URL format:", error);
        return false;
    }
}

// Function to fetch cookies automatically
async function fetchCookiesForURL(url) {
    if (!isValidURL(url)) {
        showToast("❌ Invalid URL provided");
        return null;
    }

    try {
        console.log(`Attempting to fetch cookies for URL: ${url}`);
        const cookies = await window.api.invoke('cookies:fetch', url);

        if (cookies && cookies.length) {
            document.getElementById('cookies').value = JSON.stringify(cookies, null, 2);
            console.log("Cookies fetched successfully:", cookies);
            showToast("🍪 Cookies fetched successfully");
            return cookies;
        } else {
            console.warn("No cookies were returned for the URL.");
            showToast("⚠️ No cookies found");
            return null;
        }
    } catch (error) {
        console.error("Failed to fetch cookies automatically:", error);
        showToast("❌ Error fetching cookies");
        return null;
    }
}

// Function to handle video download
async function downloadVideo() {
    const url = document.getElementById('url').value.trim();
    let cookies = document.getElementById('cookies').value.trim();

    if (!isValidURL(url)) {
        showToast('❌ Invalid URL format');
        return;
    }

    if (!cookies) {
        showToast('⏳ Fetching cookies...');
        cookies = await fetchCookiesForURL(url);
    }

    try {
        showToast('⬇️ Starting download...');
        const response = await window.api.invoke('download:video', { url, cookies });

        if (response.success) {
            console.log("Download response:", response);
            showToast('✅ Download completed successfully!');
        } else {
            console.error("Download failed:", response.error);
            showToast("❌ Download failed");
        }
    } catch (error) {
        console.error("Download error:", error);
        showToast("❌ An error occurred during the download");
    }
}

// Clear cookies field
function clearCookies() {
    const cookiesInput = document.getElementById('cookies');
    if (cookiesInput) {
        cookiesInput.value = "";
        showToast("🧹 Cookies cleared");
    } else {
        console.error("Cookies input element not found.");
    }
}

// Add event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme
    initializeTheme();

    // Attach event listeners
    document.getElementById('downloadButton').addEventListener('click', downloadVideo);
    document.getElementById('clearButton').addEventListener('click', clearCookies);
    document.getElementById('fetchCookiesButton').addEventListener('click', async () => {
        const url = document.getElementById('url').value.trim();
        await fetchCookiesForURL(url);
    });
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
});

console.log("Renderer.js script loaded successfully.");
