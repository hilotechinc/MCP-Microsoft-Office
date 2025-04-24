/**
 * @fileoverview EventService provides async event-based communication between components.
 * Supports subscribe, emit, filtering, one-time listeners, and unsubscribe. Modular, async, and testable.
 */

class EventService {
    constructor() {
        this._listeners = new Map(); // event -> [{id, handler, once, filter}]
        this._nextId = 1;
    }

    /**
     * Subscribe to an event.
     * @param {string} event
     * @param {function} handler
     * @param {object} [options] - { once: boolean, filter: function }
     * @returns {Promise<number>} Subscription id
     */
    async subscribe(event, handler, options = {}) {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        const id = this._nextId++;
        this._listeners.get(event).push({ id, handler, once: !!options.once, filter: options.filter });
        return id;
    }

    /**
     * Emit an event (async, all handlers).
     * @param {string} event
     * @param {any} payload
     * @returns {Promise<void>}
     */
    async emit(event, payload) {
        if (!this._listeners.has(event)) return;
        const listeners = this._listeners.get(event);
        // Copy for safe iteration
        for (const listener of [...listeners]) {
            if (listener.filter && !listener.filter(payload)) continue;
            await listener.handler(payload);
            if (listener.once) await this.unsubscribe(listener.id);
        }
    }

    /**
     * Unsubscribe a handler by id.
     * @param {number} id
     * @returns {Promise<void>}
     */
    async unsubscribe(id) {
        for (const [event, listeners] of this._listeners.entries()) {
            const idx = listeners.findIndex(l => l.id === id);
            if (idx !== -1) {
                listeners.splice(idx, 1);
                if (listeners.length === 0) this._listeners.delete(event);
                break;
            }
        }
    }

    /**
     * Remove all listeners (for test cleanup).
     * @returns {Promise<void>}
     */
    async clear() {
        this._listeners.clear();
    }
}

module.exports = new EventService();
