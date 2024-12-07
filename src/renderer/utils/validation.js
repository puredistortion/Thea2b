const isValidURL = (url) => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

const isValidPath = (path) => {
    // Windows path validation
    const windowsPathRegex = /^([a-zA-Z]:\\)((?:[^<>:"/\\|?*]*\\)*)([^<>:"/\\|?*]*)$/;
    // Unix path validation
    const unixPathRegex = /^(\/[\w^> ]+)+\/?$/;
    
    return windowsPathRegex.test(path) || unixPathRegex.test(path);
};

const validateCookieFile = (content) => {
    try {
        if (typeof content === 'string') {
            // Try parsing as JSON
            JSON.parse(content);
            return true;
        }
        // Check Netscape cookie file format
        const lines = content.split('\n');
        return lines.some(line => 
            line.trim() && 
            !line.startsWith('#') && 
            line.split('\t').length >= 6
        );
    } catch {
        return false;
    }
};

const isValidFileExtension = (filename, allowedExtensions) => {
    const ext = filename.split('.').pop().toLowerCase();
    return allowedExtensions.includes(ext);
};

const validateDownloadLocation = (path) => {
    if (!path) return { valid: false, error: 'Path is required' };
    if (!isValidPath(path)) return { valid: false, error: 'Invalid path format' };
    
    try {
        // Additional checks would be performed in main process
        return { valid: true };
    } catch (error) {
        return { valid: false, error: error.message };
    }
};

module.exports = {
    isValidURL,
    isValidPath,
    validateCookieFile,
    isValidFileExtension,
    validateDownloadLocation
};