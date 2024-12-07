const parseURL = (url) => {
    try {
        const parsedUrl = new URL(url);
        return {
            protocol: parsedUrl.protocol,
            hostname: parsedUrl.hostname,
            pathname: parsedUrl.pathname,
            searchParams: parsedUrl.searchParams,
            isValid: true,
            fullUrl: url,
            origin: parsedUrl.origin
        };
    } catch (error) {
        return {
            isValid: false,
            error: error.message,
            fullUrl: url
        };
    }
};

const extractVideoID = (url) => {
    try {
        const parsed = new URL(url);
        
        // YouTube
        if (parsed.hostname.includes('youtube.com')) {
            return parsed.searchParams.get('v');
        }
        // YouTube Short URL
        if (parsed.hostname.includes('youtu.be')) {
            return parsed.pathname.slice(1);
        }
        // Vimeo
        if (parsed.hostname.includes('vimeo.com')) {
            return parsed.pathname.split('/').pop();
        }
        
        return null;
    } catch (error) {
        console.error('Error extracting video ID:', error);
        return null;
    }
};

const getSupportedDomains = () => [
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'dailymotion.com',
    'twitch.tv'
];

const isVideoURL = (url) => {
    try {
        const parsed = new URL(url);
        return getSupportedDomains().some(domain => parsed.hostname.includes(domain));
    } catch {
        return false;
    }
};

module.exports = {
    parseURL,
    extractVideoID,
    getSupportedDomains,
    isVideoURL
};