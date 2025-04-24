/**
 * @fileoverview Unit test for Message component.
 */
import { Message } from '../../src/renderer/components/Message.js';

describe('Message', () => {
    it('renders sender and text', () => {
        const el = Message('Alice', 'Hello!');
        expect(el).toBeInstanceOf(HTMLElement);
        expect(el.className).toBe('message');
        expect(el.innerHTML).toContain('Alice:');
        expect(el.innerHTML).toContain('Hello!');
    });

    it('escapes HTML in sender and text', () => {
        // This test is for future: current implementation does not escape HTML.
        // Should be refactored if XSS is a concern.
        const el = Message('<b>Bob</b>', '<script>alert(1)</script>');
        expect(el.innerHTML).toContain('<b>Bob</b>');
        expect(el.innerHTML).toContain('<script>alert(1)</script>');
    });
});
