/**
 * @fileoverview Unit test for App renderer class.
 * Verifies UI rendering, component presence, and input handling.
 */
import { App } from '../../src/renderer/app.js';

describe('App', () => {
    let root;
    let api;
    beforeEach(() => {
        root = document.createElement('div');
        api = { sendQuery: jest.fn(async (q) => ({ ok: true, echo: q })) };
    });

    it('renders conversation and input components', () => {
        const app = new App({ element: root, api });
        app.render();
        expect(root.querySelector('#conversation-container')).not.toBeNull();
        expect(root.querySelector('#query-input')).not.toBeNull();
        expect(root.querySelector('#send-btn')).not.toBeNull();
    });

    it('adds user and main messages on send', async () => {
        const app = new App({ element: root, api });
        app.render();
        const input = root.querySelector('#query-input');
        input.value = 'hello';
        await app.handleSend();
        const msgs = root.querySelectorAll('.message');
        expect(msgs.length).toBe(2);
        expect(msgs[0].textContent).toContain('You:');
        expect(msgs[0].textContent).toContain('hello');
        expect(msgs[1].textContent).toContain('Main:');
        expect(msgs[1].textContent).toContain('hello');
    });

    it('does not send empty input', async () => {
        const app = new App({ element: root, api });
        app.render();
        app.input.value = '   ';
        await app.handleSend();
        const msgs = root.querySelectorAll('.message');
        expect(msgs.length).toBe(0);
    });
});
