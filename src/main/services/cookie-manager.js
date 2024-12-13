const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const electronLog = require('electron-log');

// Add stealth plugin
puppeteer.use(StealthPlugin());

// Use their simpler approach but keep our logging
async function fetchCookies(url) {
    try {
        electronLog.info('Fetching cookies for URL:', url);
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });
        const cookies = await page.cookies();
        await browser.close();
        electronLog.info(`Successfully fetched ${cookies.length} cookies`);
        return cookies;
    } catch (error) {
        electronLog.error('Failed to fetch cookies:', error);
        return [];
    }
}

module.exports = { fetchCookies };