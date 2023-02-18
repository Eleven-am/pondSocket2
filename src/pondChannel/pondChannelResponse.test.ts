import {ChannelEngine} from "../channel/channelEngine";
import {SocketCache} from "./pondChannel";
import {PondChannelResponse} from "./pondChannelResponse";


const createChannelEngine = () => {
    const parentEngine = {
        destroyChannel: jest.fn(),
        execute: jest.fn(),
    } as any;

    return new ChannelEngine('test', parentEngine);
}

const createPondResponse = () => {
    const channelEngine = createChannelEngine();

    const socket: SocketCache = {
        clientId: 'sender',
        assigns: {assign: 'assign'},
        socket: {
            send: jest.fn(),
        } as any,
    }

    const response = new PondChannelResponse(socket, channelEngine);
    return {channelEngine, socket, response};
}

describe('pondChannelResponse', () => {
    it('should create a new PondChannelResponse', () => {
        const {response} = createPondResponse();
        expect(response).toBeDefined();
    });

    it('should return the responseSent', () => {
        const {response} = createPondResponse();
        expect(response.responseSent).toEqual(false);
    });

    it('should accept the request', () => {
        const {response, channelEngine, socket} = createPondResponse();
        // spy on the channelEngine to see if the user was added
        jest.spyOn(channelEngine, 'addUser');
        response.accept();

        // check if the response was sent
        expect(response.responseSent).toEqual(true);
        expect(response.responseSent).toEqual(true);
        expect(channelEngine.addUser).toHaveBeenCalledWith(socket.clientId, socket.assigns, expect.any(Function));
        expect(channelEngine.getUserData(socket.clientId)).not.toBeNull();
    });

    it('should reject the request', () => {
        const {response, channelEngine, socket} = createPondResponse();
        // spy on the channelEngine to see if the user was added
        jest.spyOn(channelEngine, 'addUser');
        response.reject();

        // check if the response was sent
        expect(response.responseSent).toEqual(true);
        expect(channelEngine.addUser).not.toHaveBeenCalled();
        expect(channelEngine.getUserData(socket.clientId)).toBeUndefined();

        // also check if the socket was sent a message
        expect(socket.socket.send).toHaveBeenCalledWith(JSON.stringify({
            event: 'POND_ERROR',
            payload: {
                message: 'Request to join channel test rejected: Unauthorized request',
                code: 403,
            },
            channelName: 'test',
        }));
    });

    it('should send a direct message', () => {
        const {response, channelEngine, socket} = createPondResponse();
        // spy on the channelEngine to see if the user was added
        jest.spyOn(channelEngine, 'addUser');
        response.send('POND_MESSAGE', {message: 'message'});

        // check if the response was sent
        expect(response.responseSent).toEqual(true);
        expect(channelEngine.addUser).toHaveBeenCalled();
        expect(channelEngine.getUserData(socket.clientId)).toStrictEqual({"assigns": {"assign": "assign"}, "id": "sender", "presence": {}})

        // also check if the socket was sent a message
        expect(socket.socket.send).toHaveBeenCalledWith(JSON.stringify({
            event: 'POND_MESSAGE',
            payload: {
                message: 'message',
            },
            channelName: 'test',
        }));
    });

    // auxillary functions
    it('should send messages to different users', () => {
        const {response, channelEngine} = createPondResponse();
        // spy on the channelEngine to see if any messages were published
        const broadcast = jest.spyOn(channelEngine, 'broadcast');

        // add a second user to the channel
        channelEngine.addUser('user2', {assign: 'assign'}, () => {});

        // send a message to a single user
        response.sendToUsers('hello_everyone', {message: 'hello'}, ['user2']);
        expect(broadcast).toHaveBeenCalledWith(['user2'], 'hello_everyone', {message: 'hello'}, 'sender', true);

        // clear the spy
        broadcast.mockClear();

        // send a message to all users
        response.broadcast('hello_everyone', {message: 'hello'});
        expect(broadcast).toHaveBeenCalledWith('all_users', 'hello_everyone', {message: 'hello'});

        // clear the spy
        broadcast.mockClear();

        // send a message to all users except the sender
        response.broadcastFromUser('hello_everyone', {message: 'hello'});
        expect(broadcast).toHaveBeenCalledWith('all_except_sender', 'hello_everyone', {message: 'hello'}, 'sender', true);
    });
})