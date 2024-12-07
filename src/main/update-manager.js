const { autoUpdater } = require('electron-updater');
const electronLog = require('electron-log');

const configureAutoUpdater = () => {
    autoUpdater.logger = electronLog;
    autoUpdater.allowDowngrade = true;

    autoUpdater.on('update-available', () => {
        console.log('Update available');
    });

    autoUpdater.on('update-downloaded', () => {
        console.log('Update downloaded. Restart the app to apply the update.');
    });

    autoUpdater.checkForUpdatesAndNotify();
};

module.exports = { configureAutoUpdater };
