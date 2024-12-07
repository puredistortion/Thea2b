document.addEventListener('DOMContentLoaded', () => {
    // Get button elements
    const downloadButton = document.getElementById('downloadButton');
    const browseButton = document.getElementById('browseButton');
    const fetchCookiesButton = document.getElementById('fetchCookiesButton');
    const clearButton = document.getElementById('clearButton');
    const selectLocationBtn = document.getElementById('select-location-btn');

    // Download Button
    downloadButton?.addEventListener('click', async () => {
        const url = document.getElementById('url').value;
        try {
            await window.api.invoke('download:video', { 
                url,
                cookies: document.getElementById('cookies').value
            });
        } catch (error) {
            console.error('Download error:', error);
        }
    });

    // Browse Button
    browseButton?.addEventListener('click', async () => {
        try {
            const filePath = await window.api.invoke('dialog:openFile');
            if (filePath) {
                const content = await window.api.invoke('file:read', filePath);
                document.getElementById('cookies').value = content;
            }
        } catch (error) {
            console.error('Browse error:', error);
        }
    });

    // Fetch Cookies Button
    fetchCookiesButton?.addEventListener('click', async () => {
        const url = document.getElementById('url').value;
        try {
            const result = await window.api.invoke('cookies:fetch', url);
            if (result.cookies) {
                document.getElementById('cookies').value = JSON.stringify(result.cookies, null, 2);
            }
        } catch (error) {
            console.error('Cookie fetch error:', error);
        }
    });

    // Clear Button
    clearButton?.addEventListener('click', () => {
        document.getElementById('cookies').value = '';
    });

    // Select Location Button
    selectLocationBtn?.addEventListener('click', async () => {
        try {
            const result = await window.api.invoke('select-download-location');
            if (result.location) {
                document.getElementById('current-location').textContent = result.location;
            }
        } catch (error) {
            console.error('Location selection error:', error);
        }
    });

    // Load initial download location
    window.api.invoke('get-download-location')
        .then(result => {
            if (result.location) {
                document.getElementById('current-location').textContent = result.location;
            }
        })
        .catch(error => console.error('Error loading download location:', error));
});