import {ChannelEngine, InternalChannelEvent} from "./channelEngine";
import {ChannelResponse} from "./channelResponse";

const createChannelEngine = () => {
    const parentEngine = {
        destroyChannel: jest.fn(),
        execute: jest.fn(),
    } as any;

    return new ChannelEngine('test', parentEngine);
}

const createChannelEvent = () => {
    const responseEvent: InternalChannelEvent = {
        event: 'event',
        payload: {
            payload: 'payload',
        },
        sender: 'sender',
        recipient: ['recipient'],
    }

    return responseEvent;
}

const createChannelResponse = () => {
    const resolve = jest.fn();
    const channelEngine = createChannelEngine();
    const event = createChannelEvent();
    channelEngine.addUser(event.sender, {assign: 'assign'}, () => {});
    const response = new ChannelResponse(event, channelEngine, resolve);
    return {resolve, channelEngine, event, response};
}

describe('ChannelResponse', () => {
    it('should create a new ChannelResponse', () => {
        const {response} = createChannelResponse();
        expect(response).toBeDefined();
    });
    it('should return the responseSent', () => {
        const {response} = createChannelResponse();
        expect(response.responseSent).toEqual(false);
    });

    it('should accept the request', () => {
        const {response, resolve} = createChannelResponse();
        response.accept();
        expect(resolve).toHaveBeenCalledWith(true);
        expect(response.responseSent).toEqual(true);
    });

    it('should reject the request', () => {
        const {response, resolve, channelEngine, event} = createChannelResponse();
        jest.spyOn(channelEngine, 'broadcast');
        response.reject();
        expect(resolve).toHaveBeenCalledWith(false);
        expect(response.responseSent).toEqual(true);
        expect(channelEngine.broadcast).toHaveBeenCalledWith([event.sender], 'error_channel', {message: 'Unauthorized request', code: 403});
    });

    it('should send a direct message', () => {
        const {response, resolve, channelEngine, event} = createChannelResponse();
        jest.spyOn(channelEngine, 'broadcast');
        response.send('event', {payload: 'payload'});
        expect(resolve).toHaveBeenCalledWith(true);
        expect(response.responseSent).toEqual(true);
        expect(channelEngine.broadcast).toHaveBeenCalledWith([event.sender], 'event', {payload: 'payload'});
    });

    it('should broadcast a message', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'broadcast');
        response.broadcast('event', {payload: 'payload'});
        expect(channelEngine.broadcast).toHaveBeenCalledWith('all_users', 'event', {payload: 'payload'});
    });

    it('should broadcastFromUser a message', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'broadcast');
        response.broadcastFromUser('event', {payload: 'payload'});
        expect(channelEngine.broadcast).toHaveBeenCalledWith('all_except_sender', 'event', {payload: 'payload'}, 'sender', true);
    });

    it('should sendToUsers a message', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'broadcast');
        channelEngine.addUser('recipient', {assign: 'assign'}, () => {});
        response.sendToUsers('event', {payload: 'payload'}, ['recipient']);
        expect(channelEngine.broadcast).toHaveBeenCalledWith(['recipient'], 'event', {payload: 'payload'}, 'sender', true);
    });

    it('should track a trackPresence', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'trackPresence');
        response.trackPresence({status: 'online'});
        expect(channelEngine.trackPresence).toHaveBeenCalledWith('sender', {status: 'online'});
    });

    it('should untrack a trackPresence', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'untrackPresence');
        response.untrackPresence();
        expect(channelEngine.untrackPresence).toHaveBeenCalledWith('sender');
    });

    it('should updatePresence', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'updatePresence');
        response.trackPresence({status: 'online'})
        response.updatePresence({status: 'updated'});
        expect(channelEngine.updatePresence).toHaveBeenCalledWith('sender', {status: 'updated'});
    });

    it('should evict a user', () => {
        const {response, channelEngine, resolve} = createChannelResponse();
        jest.spyOn(channelEngine, 'kickUser');
        response.evictUser('recipient');
        expect(channelEngine.kickUser).toHaveBeenCalledWith('sender', 'recipient');
        expect(resolve).toHaveBeenCalledWith(false);
        expect(response.responseSent).toEqual(true);
    });

    it('should destroy the channel', () => {
        const {response, channelEngine, resolve} = createChannelResponse();
        jest.spyOn(channelEngine, 'destroy');
        response.closeChannel('recipient');
        expect(channelEngine.destroy).toHaveBeenCalledWith('recipient');
        expect(response.responseSent).toEqual(true);
        expect(resolve).toHaveBeenCalledWith(false);
    });
});
