
module.exports = {
    // ...
    packagerConfig: {
        icon: './mpv-icon' // no file extension required
    },
    // ...
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                authors: 'riad boussaid',
                description: 'An example Electron app',
                setupIcon: './mpv-icon.ico',
            },
        },
    ], 
}