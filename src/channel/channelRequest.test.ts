import {ChannelRequest} from "./channelRequest";
import {createChannelEngine, createChannelEvent} from "./channelResponse.test";


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
        expect(channelRequest.internalEvent).toEqual(event.payload);
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
