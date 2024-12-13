const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Cluster } = require('puppeteer-cluster');

// Initialize stealth plugin
puppeteer.use(StealthPlugin());

class CookieManager {
    constructor(config = {}) {
        this.config = {
            maxConcurrency: config.maxConcurrency || 1,
            maxRetries: config.maxRet