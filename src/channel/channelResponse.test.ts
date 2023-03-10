import {ChannelEngine, InternalChannelEvent} from "./channelEngine";
import {ChannelResponse} from "./channelResponse";
import {createParentEngine} from "./channelEngine.test";

export const createChannelEngine = () => {
    const parentEngine = createParentEngine();

    return new ChannelEngine('test', parentEngine);
}

export const createChannelEvent = () => {
    const responseEvent: InternalChannelEvent = {
        event: 'event',
        payload: {
            payload: 'payload',
        },
        sender: 'sender',
        recipients: ['recipient'],
    }

    return responseEvent;
}

const createChannelResponse = () => {
    const channelEngine = createChannelEngine();
    const event = createChannelEvent();
    channelEngine.addUser(event.sender, {assign: 'assign'}, () => {});
    const response = new ChannelResponse(event, channelEngine);
    return {channelEngine, event, response};
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
        const {response} = createChannelResponse();
        response.accept();
        expect(response.responseSent).toEqual(true);
    });

    it('should reject the request', () => {
        const {response, channelEngine, event} = createChannelResponse();
        jest.spyOn(channelEngine, 'sendMessage');
        response.reject();
        expect(response.responseSent).toEqual(true);
        expect(channelEngine.sendMessage).toHaveBeenCalledWith('channel', [event.sender], 'error_channel', {message: 'Unauthorized request', code: 403});
    });

    it('should send a direct message', () => {
        const {response, channelEngine, event} = createChannelResponse();
        jest.spyOn(channelEngine, 'sendMessage');
        response.send('event', {payload: 'payload'});
        expect(response.responseSent).toEqual(true);
        expect(channelEngine.sendMessage).toHaveBeenCalledWith('channel', [event.sender], 'event', {payload: 'payload'});
    });

    it('should broadcast a message', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'sendMessage');
        response.broadcast('event', {payload: 'payload'});
        expect(channelEngine.sendMessage).toHaveBeenCalledWith('sender', 'all_users', 'event', {payload: 'payload'});
    });

    it('should broadcastFromUser a message', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'sendMessage');
        response.broadcastFromUser('event', {payload: 'payload'});
        expect(channelEngine.sendMessage).toHaveBeenCalledWith('sender', 'all_except_sender', 'event', {payload: 'payload'});
    });

    it('should sendToUsers a message', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'sendMessage');
        channelEngine.addUser('recipient', {assign: 'assign'}, () => {});
        response.sendToUsers('event', {payload: 'payload'}, ['recipient']);
        expect(channelEngine.sendMessage).toHaveBeenCalledWith('sender', ['recipient'], 'event', {payload: 'payload'});
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

    it('should broadcast an error if untrackPresence is called twice', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'sendMessage');
        // because by default the user is not tracked and the presence enghine only exists after a first trackPresence
        // we need to call trackPresence first
        response.trackPresence({status: 'online'});
        response.untrackPresence();
        response.untrackPresence();
        expect(channelEngine.sendMessage).toHaveBeenCalledWith('channel', ['sender'], 'error_channel', {
            message: 'PresenceEngine: Presence with key sender does not exist', code: 500
        });
    });

    it('should updatePresence', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'updatePresence');
        response.trackPresence({status: 'online'})
        response.updatePresence({status: 'updated'});
        expect(channelEngine.updatePresence).toHaveBeenCalledWith('sender', {status: 'updated'});
    });

    it('should update a users assign data', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'updateAssigns');
        response.accept({assign: 'updated'});
        expect(channelEngine.updateAssigns).toHaveBeenCalledWith('sender', {assign: 'updated'});
    });

    it('should evict a user', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'kickUser');
        response.evictUser('recipient');
        expect(channelEngine.kickUser).toHaveBeenCalledWith('sender', 'recipient');
        expect(response.responseSent).toEqual(true);
    });

    it('should destroy the channel', () => {
        const {response, channelEngine} = createChannelResponse();
        jest.spyOn(channelEngine, 'destroy');
        response.closeChannel('recipient');
        expect(channelEngine.destroy).toHaveBeenCalledWith('recipient');
        expect(response.responseSent).toEqual(true);
    });
});
