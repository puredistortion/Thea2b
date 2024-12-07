const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { chmod } = require('fs/promises');

const YT_DLP_URLS = {
  win32: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
  darwin: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
  linux: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
};

async function downloadFile(url, outputPath) {
  const writer = fs.createWriteStream(outputPath);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

async function prepareYtDlp() {
  try {
    // Create resources directory if it doesn't exist
    const resourcesDir = path.join(__dirname, '..', 'resources', 'yt-dlp');
    await fs.ensureDir(resourcesDir);

    // Determine platform
    const platform = process.platform;
    const ytDlpUrl = YT_DLP_URLS[platform];
    
    if (!ytDlpUrl) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    // Download yt-dlp
    const outputFile = path.join(resourcesDir, platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    console.log(`Downloading yt-dlp from ${ytDlpUrl}...`);
    await downloadFile(ytDlpUrl, outputFile);

    // Make binary executable on Unix systems
    if (platform !== 'win32') {
      await chmod(outputFile, '755');
      console.log('Made yt-dlp executable');
    }

    console.log('yt-dlp prepared successfully');
  } catch (error) {
    console.error('Error preparing yt-dlp:', error);
    process.exit(1);
  }
}

prepareYtDlp();