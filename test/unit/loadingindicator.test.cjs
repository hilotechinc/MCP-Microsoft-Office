/**
 * @fileoverview Unit test for LoadingIndicator component.
 */
import { LoadingIndicator } from '../../src/renderer/components/LoadingIndicator.js';

describe('LoadingIndicator', () => {
    let root;
    beforeEach(() => {
        root = document.createElement('div');
    });

    it('renders and is hidden by default', () => {
        const indicator = new LoadingIndicator(root);
        expect(root.querySelector('.loading-indicator')).not.toBeNull();
        expect(indicator.container.style.display).toBe('none');
    });

    it('shows and hides with correct text', () => {
        const indicator = new LoadingIndicator(root, { text: 'Please wait...' });
        indicator.show();
        expect(indicator.container.style.display).toBe('block');
        indicator.hide();
        expect(indicator.container.style.display).toBe('none');
    });

    it('can set loading text dynamically', () => {
        const indicator = new LoadingIndicator(root);
        indicator.show('Loading data...');
        expect(indicator.container.innerHTML).toBe('Loading data...');
        indicator.setText('Almost done...');
        expect(indicator.container.innerHTML).toBe('Almost done...');
    });
});
