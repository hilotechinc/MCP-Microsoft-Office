const eventService = require('../../../src/core/event-service');

describe('EventService', () => {
    beforeEach(async () => {
        await eventService.clear();
    });

    it('should subscribe and emit events', async () => {
        const handler = jest.fn();
        await eventService.subscribe('test', handler);
        await eventService.emit('test', { foo: 1 });
        expect(handler).toHaveBeenCalledWith({ foo: 1 });
    });

    it('should support multiple handlers', async () => {
        const h1 = jest.fn();
        const h2 = jest.fn();
        await eventService.subscribe('multi', h1);
        await eventService.subscribe('multi', h2);
        await eventService.emit('multi', 42);
        expect(h1).toHaveBeenCalledWith(42);
        expect(h2).toHaveBeenCalledWith(42);
    });

    it('should support one-time listeners', async () => {
        const handler = jest.fn();
        await eventService.subscribe('once', handler, { once: true });
        await eventService.emit('once', 'a');
        await eventService.emit('once', 'b');
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith('a');
    });

    it('should support unsubscribe', async () => {
        const handler = jest.fn();
        const id = await eventService.subscribe('sub', handler);
        await eventService.unsubscribe(id);
        await eventService.emit('sub', 123);
        expect(handler).not.toHaveBeenCalled();
    });

    it('should support filters', async () => {
        const handler = jest.fn();
        await eventService.subscribe('filter', handler, { filter: (p) => p.pass });
        await eventService.emit('filter', { pass: false });
        await eventService.emit('filter', { pass: true });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ pass: true });
    });
});
