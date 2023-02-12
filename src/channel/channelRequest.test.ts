import {ChannelRequest} from "./channelRequest";
import {ChannelEngine, InternalChannelEvent} from "./channelEngine";

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

describe('ChannelRequest', () => {
    it('should create a new ChannelRequest', () => {
        const channelEngine = createChannelEngine();
        const event = createChannelEvent();
        const channelRequest = new ChannelRequest(event, channelEngine);
        expect(channelRequest).toBeDefined();
    });

    it('should return the payload', () => {
        const channelEngine = createChannelEngine();
        const event = createChannelEvent();
        const channelRequest = new ChannelRequest(event, channelEngine);
        expect(channelRequest.payload).toEqual(event.payload);
    });

    it('should return the user', () => {
        const channelEngine = createChannelEngine();
        const event = createChannelEvent();
        const channelRequest = new ChannelRequest(event, channelEngine);

        // because the user in the event does not exist in the channel, this should throw an error
        expect(() => channelRequest.user).toThrow();

        // add the user to the channel
        channelEngine.addUser(event.sender, {assign: 'assign'}, () => {});

        // now the user should be returned
        expect(channelRequest.user).toEqual(channelEngine.getUserData(event.sender));
    });
});
