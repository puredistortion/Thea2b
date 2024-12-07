const { contextBridge, ipcRenderer } = require('electron');

// Define valid channels for IPC communication
const validChannels = {
    invoke: [
        'download:video',         // Main download channel
        'download:pause',
        'download:resume',
        'download:cancel',
        'download:status',
        'cookies:fetch',
        'cookies:save',
        'cookies:load',
        'dialog:openFile',
        'dialog:saveFile',
        'file:read',
        'file:write',
        'get-download-location',
        'select-download-location',
        'settings:get',
        'settings:set'
    ],
    receive: [
        'download-progress',
        'download-error',
        'download-complete',
        'download:status-update',
        'download:progress'  // Added to match main process event
    ]
};

// Expose protected methods that renderer process can access
contextBridge.exposeInMainWorld(
    'api',
    {
        invoke: async (channel, data) => {
            if (!validChannels.invoke.includes(channel)) {
                console.error(`Invalid invoke channel requested: ${channel}`);
                throw new Error(`Invalid invoke channel: ${channel}`);
            }
            try {
                return await ipcRenderer.invoke(channel, data);
            } catch (error) {
                console.error(`Error invoking ${channel}:`, error);
                throw error;
            }
        },
        receive: (channel, func) => {
            if (!validChannels.receive.includes(channel)) {
                console.error(`Invalid receive channel requested: ${channel}`);
                throw new Error(`Invalid receive channel: ${channel}`);
            }
            const subscription = (event, ...args) => func(...args);
            ipcRenderer.on(channel, subscription);
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        }
    }
);

// Log successful initialization
console.log('Preload script initialized successfully');