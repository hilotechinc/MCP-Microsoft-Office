/**
 * @fileoverview Exports modular Electron application menu template and setup function.
 * Allows for unit testing of menu structure and custom items.
 */
const getMenuTemplate = (dialog) => [
    {
        label: 'File',
        submenu: [
            { role: 'quit' }
        ]
    },
    {
        label: 'Edit',
        submenu: [
            { role: 'undo' }, { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' }, { role: 'copy' }, { role: 'paste' }
        ]
    },
    {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'toggledevtools' },
            { type: 'separator' },
            { role: 'resetzoom' }, { role: 'zoomin' }, { role: 'zoomout' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    },
    {
        label: 'Window',
        submenu: [
            { role: 'minimize' }, { role: 'close' }
        ]
    },
    {
        label: 'Help',
        submenu: [
            {
                label: 'About MCP Desktop',
                click: async () => {
                    if (dialog) {
                        dialog.showMessageBox({
                            type: 'info',
                            title: 'About',
                            message: 'MCP Desktop\nVersion 0.1.0\nMicrosoft Cloud Platform Client'
                        });
                    }
                }
            }
        ]
    }
];

function setApplicationMenu(Menu, dialog) {
    const template = getMenuTemplate(dialog);
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    return template;
}

module.exports = { getMenuTemplate, setApplicationMenu };
