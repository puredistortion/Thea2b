document.addEventListener('DOMContentLoaded', () => {
    // Get button elements
    const downloadButton = document.getElementById('downloadButton');
    const browseButton = document.getElementById('browseButton');
    const fetchCookiesButton = document.getElementById('fetchCookiesButton');
    const clearButton = document.getElementById('clearButton');
    const selectLocationBtn = document.getElementById('select-location-btn');

    // Download Button
    downloadButton?.addEventListener('click', async () => {
        const url = document.getElementById('url').value.trim();
        const cookies = document.getElementById('cookies').value.trim();
        
        if (!url) {
            alert('Please enter a valid URL!');
            return;
        }

        try {
            const result = await window.api.invoke('download:video', { url, cookies });
            if (result.success) {
                alert(result.message || 'Download started successfully!');
            } else {
                console.error('Download error:', result.error);
                alert(result.error || 'Failed to start the download.');
            }
        } catch (error) {
            console.error('Download error:', error);
            alert('An unexpected error occurred while starting the download.');
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
            alert('Failed to load the selected file.');
        }
    });

    // Fetch Cookies Button
    fetchCookiesButton?.addEventListener('click', async () => {
        const url = document.getElementById('url').value.trim();

        if (!url) {
            alert('Please enter a valid URL to fetch cookies.');
            return;
        }

        try {
            const result = await window.api.invoke('cookies:fetch', url);
            if (result.success && result.cookies) {
                document.getElementById('cookies').value = JSON.stringify(result.cookies, null, 2);
                alert('Cookies fetched successfully!');
            } else {
                console.error('Cookie fetch error:', result.error);
                alert(result.error || 'Failed to fetch cookies.');
            }
        } catch (error) {
            console.error('Cookie fetch error:', error);
            alert('An unexpected error occurred while fetching cookies.');
        }
    });

    // Clear Button
    clearButton?.addEventListener('click', () => {
        document.getElementById('cookies').value = '';
        alert('Cookies cleared successfully!');
    });

    // Select Location Button
    selectLocationBtn?.addEventListener('click', async () => {
        try {
            const result = await window.api.invoke('select-download-location');
            if (result.success && result.location) {
                document.getElementById('current-location').textContent = result.location;
                alert('Download location updated successfully!');
            } else {
                console.error('Location selection error:', result.error);
                alert(result.error || 'Failed to update download location.');
            }
        } catch (error) {
            console.error('Location selection error:', error);
            alert('An unexpected error occurred while selecting the download location.');
        }
    });

    // Load initial download location
    window.api.invoke('get-download-location')
        .then(result => {
            if (result.success && result.location) {
                document.getElementById('current-location').textContent = result.location;
            }
        })
        .catch(error => console.error('Error loading download location:', error));
});
