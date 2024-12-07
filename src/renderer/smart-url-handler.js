function integrateSmartURLHandler(controller) {
    const elements = controller.getURLElements();
    
    const smartHandler = {
        processURL(url) {
            return url.trim();
        },
        
        validateURL(url) {
            try {
                new URL(url);
                return true;
            } catch {
                return false;
            }
        },
        
        async handleURLChange(url) {
            const processedURL = this.processURL(url);
            if (this.validateURL(processedURL)) {
                await controller.handleURLChange(processedURL);
            }
        }
    };

    // Add event listeners
    if (elements.urlInput) {
        elements.urlInput.addEventListener('paste', async (event) => {
            const pastedText = event.clipboardData.getData('text');
            await smartHandler.handleURLChange(pastedText);
        });

        elements.urlInput.addEventListener('drop', async (event) => {
            event.preventDefault();
            const droppedText = event.dataTransfer.getData('text');
            await smartHandler.handleURLChange(droppedText);
        });
    }

    return smartHandler;
}

// Use module.exports instead of export
module.exports = { integrateSmartURLHandler };