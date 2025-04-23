/**
 * @fileoverview Unit test for Conversation component.
 */
import { Conversation } from '../../src/renderer/components/Conversation.js';

describe('Conversation', () => {
    let root;
    beforeEach(() => {
        root = document.createElement('div');
    });

    it('renders messages', () => {
        const conv = new Conversation(root);
        conv.render([
            { sender: 'Alice', text: 'Hello' },
            { sender: 'Bob', text: 'Hi!' }
        ]);
        const msgs = root.querySelectorAll('.message');
        expect(msgs.length).toBe(2);
        expect(msgs[0].textContent).toContain('Alice:');
        expect(msgs[0].textContent).toContain('Hello');
        expect(msgs[1].textContent).toContain('Bob:');
        expect(msgs[1].textContent).toContain('Hi!');
    });

    it('adds a message incrementally', () => {
        const conv = new Conversation(root);
        conv.addMessage('Me', 'Test message');
        const msgs = root.querySelectorAll('.message');
        expect(msgs.length).toBe(1);
        expect(msgs[0].textContent).toContain('Me:');
        expect(msgs[0].textContent).toContain('Test message');
    });

    it('clears all messages', () => {
        const conv = new Conversation(root);
        conv.render([{ sender: 'A', text: 'B' }]);
        conv.clear();
        expect(root.querySelectorAll('.message').length).toBe(0);
    });
});
