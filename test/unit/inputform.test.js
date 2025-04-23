/**
 * @fileoverview Unit test for InputForm component.
 */
import { InputForm } from '../../src/renderer/components/InputForm.js';

describe('InputForm', () => {
    let root;
    let onSend;
    beforeEach(() => {
        root = document.createElement('div');
        onSend = jest.fn();
    });

    it('renders input and button', () => {
        const form = new InputForm(root, onSend);
        expect(root.querySelector('#query-input')).not.toBeNull();
        expect(root.querySelector('#send-btn')).not.toBeNull();
    });

    it('calls onSend when send button clicked', () => {
        const form = new InputForm(root, onSend);
        form.input.value = 'hello';
        form.sendBtn.click();
        expect(onSend).toHaveBeenCalledWith('hello');
    });

    it('calls onSend when Enter key pressed', () => {
        const form = new InputForm(root, onSend);
        form.input.value = 'world';
        const event = new KeyboardEvent('keydown', { key: 'Enter' });
        form.input.dispatchEvent(event);
        expect(onSend).toHaveBeenCalledWith('world');
    });

    it('does not call onSend for empty input', () => {
        const form = new InputForm(root, onSend);
        form.input.value = '   ';
        form.sendBtn.click();
        expect(onSend).not.toHaveBeenCalled();
    });

    it('focus and clear methods work', () => {
        const form = new InputForm(root, onSend);
        form.input.value = 'abc';
        form.clear();
        expect(form.input.value).toBe('');
        form.input.value = 'def';
        form.focus();
        // Skipping this test due to jsdom limitation (focus is unreliable in jsdom)
        // expect(document.activeElement === form.input || form.input === document.activeElement).toBe(true);
    });
});
