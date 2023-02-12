import request from "superwstest";
import {PondSocket} from "../server/pondSocket";
import {ClientActions, ClientMessage} from "./endpointEngine";
import {PondChannel} from "../pondChannel/pondChannel";

const createPondSocket = () => {
    const mock = jest.fn();
    const socket = new PondSocket();
    const server = socket.listen(3001, mock);

    const createPondChannel = () => {
        return new PondChannel();
    }

    return {socket, server, mock, createPondChannel};
}

describe('endpoint', () => {
    it('should be able to close a socket', async () => {
        const {socket, server} = createPondSocket();
        expect(server).toBeDefined();
        const endpoint = socket.createEndpoint('/api/:path', (req, res) => {
            expect(req.params.path).toBe('socket');
            res.accept();

            setTimeout(() => {
                endpoint.closeConnection(req.id);
            }, 100);
        });

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .wait(200)
            .expectClosed();

        server.close();
    });

    it('should be able to list connections', async () => {
        const {socket, server} = createPondSocket();
        let connectionsCount = 0;
        expect(server).toBeDefined();
        const endpoint = socket.createEndpoint('/api/:path', (req, res) => {
            expect(req.params.path).toBe('socket');
            connectionsCount = endpoint.listConnections().length;
            res.accept();
        });

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))

        server.close(); // Close the server to stop the connection from being kept alive
        expect(connectionsCount).toBe(1);
        expect(endpoint.listConnections().length).toBe(2); // The connections are still in the list
    });

    it('should be capable of sending messages to all clients', async () => {
        const {socket, server} = createPondSocket();

        expect(server).toBeDefined();

        let users = 0;
        const endpoint = socket.createEndpoint('/api/:room', (req, res) => {
            users++;
            res.send('Hello', {room: req.params.room});
            if (users > 0)
                endpoint.broadcast('TEST', {message: 'Hello everyone'});
        });

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .expectJson({
                event: 'Hello',
                channelName: 'SERVER',
                payload: {
                    room: 'socket'
                }
            })
            .expectJson({
                event: 'TEST',
                channelName: `SERVER`,
                payload: {
                    message: 'Hello everyone'
                }
            })
            .close()
            .expectClosed();

        await request(server)
            .ws('/api/secondSocket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .expectJson({
                event: 'Hello',
                channelName: 'SERVER',
                payload: {
                    room: 'secondSocket'
                }
            })
            .expectJson({
                event: 'TEST',
                channelName: 'SERVER',
                payload: {
                    message: 'Hello everyone'
                }
            }).close()
            .expectClosed();

        server.close();
    });

    it('should be able to accept connections on this handler', async () => {
        const message: ClientMessage = {
            action: ClientActions.JOIN_CHANNEL,
            channelName: '/test/socket',
            event: 'TEST', payload: {}
        }

        const {socket, server, createPondChannel} = createPondSocket();

        expect(server).toBeDefined();

        const endpoint = socket.createEndpoint('/api/:room', (_, res) => {
            res.accept();
        });

        const testPond = createPondChannel();
        const socketPond = createPondChannel();

        testPond.onJoinRequest((req, res) => {
            expect(req.event.params.room).toBeDefined();
            res.accept({
                assigns: {
                    status: 'online',
                }
            });
        });

        socketPond.onJoinRequest((req, res) => {
            expect(req.event.params.room).toBeDefined();
            res.accept({
                assigns: {
                    status: 'online socket',
                }
            });
        });

        endpoint.useChannel('/test/:room', testPond);
        endpoint.useChannel('/socket/:room', socketPond);

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson(message).close()
            .expectClosed();

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson({
                ...message,
                channelName: '/socket/socket'
            }).close()
            .expectClosed();

        expect(endpoint['_channels']).toHaveLength(2);
        server.close();
    });

    it('should refuse connections if there are no pondChannel handlers', async () => {
        const {socket, server, createPondChannel} = createPondSocket();
        expect(server).toBeDefined();

        const endpoint = socket.createEndpoint('/api/:room', (_, res) => {
            res.accept();
        });

        const testPond = createPondChannel();
        testPond.onJoinRequest((req, res) => {
            expect(req.event.params.room).toBeDefined();
            res.accept({
                assigns: {
                    status: 'online',
                }
            });
        });

        endpoint.useChannel('/test/:room', testPond);

        const message: ClientMessage = {
            action: ClientActions.JOIN_CHANNEL,
            channelName: '/test/socket',
            event: 'TEST', payload: {}
        }

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson(message).close()
            .expectClosed();

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson({
                ...message, channelName: '/socket/socket' // This channel handler does not exist
            })
            .expectJson({
                event: "error",
                channelName: "ENDPOINT",
                payload: {
                    message: "GatewayEngine: Channel /socket/socket does not exist"
                }
            }).close()
            .expectClosed();

        server.close();
        expect(endpoint['_channels']).toHaveLength(1);
    });

    it('should send an error when we send an incomplete message', async () => {
        const {socket, server, createPondChannel} = createPondSocket();
        expect(server).toBeDefined();

        const testPond = createPondChannel();

        const endpoint = socket.createEndpoint('/api/:room', (_, res) => {
            res.accept();
        });

        testPond.onJoinRequest((req, res) => {
            expect(req.event.params.room).toBeDefined();
            res.accept({
                assigns: {
                    status: 'online',
                }
            });
        });

        endpoint.useChannel('/test/:room', testPond);

        const message: ClientMessage = {
            action: ClientActions.LEAVE_CHANNEL,
            channelName: '/test/socket',
            event: 'TEST', payload: {}
        }

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson({
                ...message, action: null
            })
            .expectJson({
                event: "error",
                channelName: 'ENDPOINT',
                payload: {
                    message: "No action provided",
                }
            }).close()
            .expectClosed();

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson({
                ...message, action: ClientActions.BROADCAST, channelName: null
            })
            .expectJson({
                event: "error",
                channelName: 'ENDPOINT',
                payload: {
                    message: "No channel name provided",
                }
            }).close()
            .expectClosed();

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson({
                ...message, action: ClientActions.BROADCAST_FROM, payload: null
            })
            .expectJson({
                event: "error",
                channelName: 'ENDPOINT',
                payload: {
                    message: "No payload provided",
                }
            }).close()
            .expectClosed();

        // send incorrect Json message
        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .send('"action": "JOIN_CHANNEL", "channelName": "/test/socket", "event": "TEST", "payload": {}}')
            .expectJson({
                event: "error",
                channelName: 'ENDPOINT',
                payload: {
                    message: "Invalid JSON",
                }
            }).close()
            .expectClosed();

        server.close();
        expect(endpoint['_channels']).toHaveLength(1);
    });

    /*it('should send an error when the channel exists but other things happen', async () => {
        const {socket, server} = createPondSocket();
        expect(server).toBeDefined();

        const endpoint = socket.createEndpoint('/api/:room', (_, res) => {
            res.accept();
        });

        const channel = endpoint.createChannel('/test/:room', (req, res, _) => {
            expect(req.params.room).toBeDefined();
            res.accept();
        });

        channel.on('/test/:room', (req, res, _) => {
            if (req.params.room === 'TEST') {
                res.accept();
            } else if (req.params.room === 'TEST2') {
                res.reject();
            } else if (req.params.room === 'TEST3') {
                res.reject('choke on my balls');
            } else res.reject('TEST');
        });

        const message: ClientMessage = {
            action: ClientActions.JOIN_CHANNEL, channelName: '/test/socket', event: 'TEST', payload: {}
        }

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson(message)
            .expectJson() // receives a presence message, this can not be matched because the payload is dynamic
            .sendJson({
                ...message, event: '/test/TEST2', action: ClientActions.BROADCAST,
            })
            .expectJson({
                action: "ERROR", event: "error", channelName: "/test/socket", payload: {
                    message: "Message rejected", code: 403
                }
            })
            .sendJson({
                ...message, channelName: "/test/socket", action: ClientActions.BROADCAST,
            })
            .expectJson({
                action: ServerActions.MESSAGE, payload: {}, event: "TEST", channelName: "/test/socket"
            })
            .sendJson({
                ...message, action: ClientActions.SEND_MESSAGE_TO_USER,
            })
            .expectJson({
                action: ServerActions.ERROR,
                event: "error",
                channelName: PondSenders.ENDPOINT,
                payload: {
                    message: "Error while executing event 'TEST' on channel '/test/socket': No addresses provided"
                }
            })

        expect(endpoint.listChannels()).toHaveLength(1);
        server.close();
    });

    it('should be capable of sending messages to a specific user', async () => {
        const {socket, server} = createPondSocket();
        expect(server).toBeDefined();

        const endpoint = socket.createEndpoint('/api/:room', (_, res) => {
            res.accept();
        });

        const channel = endpoint.createChannel('/test/:room', (req, res, _) => {
            expect(req.params.room).toBeDefined();
            res.accept();
        });

        channel.on('/test/:room', (req, res, _) => {
            if (req.params.room === 'TEST') {
                res.accept();
            } else if (req.params.room === 'TEST2') {
                res.reject();
            } else if (req.params.room === 'TEST3') {
                res.reject('choke on my balls');
            } else res.reject('TEST');
        });

        const message: ClientMessage = {
            action: ClientActions.JOIN_CHANNEL, channelName: '/test/socket', event: 'TEST', payload: {}
        }

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson(message)
            .expectJson() // receives a presence message, this can not be matched because the payload is dynamic
            .sendJson({
                ...message, action: ClientActions.BROADCAST_FROM, payload: {
                    message: {
                        action: ServerActions.MESSAGE, payload: {}, event: "TEST", channelName: "/test/socket"
                    }
                }
            })

        expect(endpoint.listChannels()).toHaveLength(1);
        server.close();
    });

    it('should be able to update user presence on user demand', async () => {
        const {socket, server} = createPondSocket();
        expect(server).toBeDefined();

        const endpoint = socket.createEndpoint('/api/:room', (_, res) => {
            res.accept();
        });

        endpoint.createChannel('/test/:room', (req, res, _) => {
            expect(req.params.room).toBeDefined();
            res.accept();
        });

        const message: ClientMessage = {
            action: ClientActions.JOIN_CHANNEL, channelName: '/test/socket', event: 'TEST', payload: {}
        }

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson(message)
            .expectJson() // receives a presence message, this can not be matched because the payload is dynamic
            .sendJson({
                ...message, action: ClientActions.UPDATE_PRESENCE, payload: {
                    presence: {
                        status: 'online'
                    }
                }
            })
            .expectJson() // receives a presence message, this can not be matched because the payload is dynamic
            .sendJson({
                ...message, action: ClientActions.SEND_MESSAGE_TO_USER, addresses: [], payload: {}
            })
            .expectJson({
                action: ServerActions.ERROR,
                event: "error",
                channelName: PondSenders.ENDPOINT,
                payload: {
                    message: "Error while executing event 'TEST' on channel '/test/socket': No addresses provided"
                }
            })
            .sendJson({
                ...message, action: ClientActions.SEND_MESSAGE_TO_USER, addresses: ['hello'], payload: {}
            })
            .expectJson({
                action: ServerActions.ERROR,
                event: "error",
                channelName: PondSenders.ENDPOINT,
                payload: {
                    message: "Error while executing event 'TEST' on channel '/test/socket': Client(s) with clientId(s) hello were not found in channel /test/socket"
                }
            })
            .sendJson({
                ...message, action: ClientActions.UPDATE_PRESENCE, payload: {
                    assigns: {
                        status: 'online'
                    }
                }
            })
            .close()
            .expectClosed();

        expect(endpoint.listChannels()).toHaveLength(1); // the channel has not been removed yet

        await request(server)
            .ws('/api/newSocket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson({
                ...message, channelName: '/test/socket2',
            })
            .expectJson() // receives a presence message, this can not be matched because the payload is dynamic
            .sendJson({
                ...message, action: ClientActions.LEAVE_CHANNEL,
                channelName: '/test/socket2',
            })
            .expectJson()

        expect(endpoint.listChannels()).toHaveLength(0) // by now the first channel should have been removed; and since we gracefully closed the connection, the second channel should have been removed as well
        server.close();
    });

    it('should ba able to send messages to a specific user', async () => {
        const {socket, server} = createPondSocket();
        expect(server).toBeDefined();

        const endpoint = socket.createEndpoint('/api/:room', (_, res) => {
            res.accept();
        });

        const channel = endpoint.createChannel('/test/:room', (req, res, _) => {
            expect(req.params.room).toBeDefined();
            res.accept();
        });

        channel.on(':room', (req, res, _) => {
            if (req.params.room === 'TEST') {
                endpoint.send(req.client.clientId, 'Test', {message: 'hello'});
                res.accept();
            }
        });

        const message: ClientMessage = {
            action: ClientActions.JOIN_CHANNEL, channelName: '/test/socket', event: 'TEST', payload: {}
        }

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson(message)
            .expectJson() // receives a presence message, this can not be matched because the payload is dynamic
            .sendJson({
                ...message, action: ClientActions.BROADCAST_FROM, payload: {
                    message: {
                        action: ServerActions.MESSAGE, payload: {}, event: "TEST", channelName: "/test/socket"
                    }
                }
            }).expectJson({
                action: ServerActions.MESSAGE,
                event: 'Test', channelName: PondSenders.ENDPOINT,
                payload: {
                    message: 'hello'
                }
            })

        expect(endpoint.listChannels()).toHaveLength(1);
        server.close();
    });

    it('should be able ot manage error from the client side', async () => {
        const {socket, server} = createPondSocket();
        expect(server).toBeDefined();

        const endpoint = socket.createEndpoint('/api/:room', (_, res) => {
            res.accept();
        });

        const channel = endpoint.createChannel('/test/:room', (req, res, _) => {
            expect(req.params.room).toBeDefined();
            res.accept();
        });

        channel.on(':room', (req, res) => {
            if (req.params.room === 'TEST') {
                res.reject('TEST');
            }
        });

        const message: ClientMessage = {
            action: ClientActions.JOIN_CHANNEL, channelName: '/test/socket', event: 'TEST', payload: {}
        }

        const functionToTest = (ws: WebSocket) => {
            try {
                ws.emit('error', {});
            } catch (e) {
                console.log(e);
            }
        }

        try {
            await request(server)
                .ws('/api/socket')
                .expectUpgrade(res => expect(res.statusCode).toBe(101))
                .sendJson(message)
                .exec(functionToTest)
                .expectClosed();
        } catch (e) {
            console.log(e);
        }

        expect(endpoint.listChannels()).toHaveLength(0); // the socket should have been removed
        expect(endpoint['_findChannel']('/test/socket')).toBeUndefined();
        server.close();
    });*/

    it('should send an error when the channel exists but other things happen', async () => {
        const {socket, server, createPondChannel} = createPondSocket();
        expect(server).toBeDefined();

        const endpoint = socket.createEndpoint('/api/:room', (_, res) => {
            res.accept();
        });

        const channel = createPondChannel();

        channel.onEvent(':room', (req, res) => {
            if (req.event.params.room === 'TEST')
                res.accept();
            else if (req.event.params.room === 'TEST2')
                res.reject();
            else
                res.reject('choke on my balls');
        });

        channel.onJoinRequest((_, res) => {
            res.accept();
        });

        endpoint.useChannel('/test/:room', channel);

        const message: ClientMessage = {
            action: ClientActions.JOIN_CHANNEL,
            channelName: '/test/socket',
            event: 'TEST', payload: {}
        }

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson(message)
            .sendJson({
                ...message, event: 'TEST2', action: ClientActions.BROADCAST,
            })
            .expectJson({
                event: "error_channel",
                channelName: "/test/socket",
                payload: {
                    message: "Unauthorized request",
                    code: 403
                }
            })
            .sendJson({
                ...message, channelName: "/test/socket", action: ClientActions.BROADCAST,
            })
            .expectJson({
                payload: {}, event: "TEST", channelName: "/test/socket"
            })
            .sendJson({
                ...message, event: 'TEST3', action: ClientActions.BROADCAST,
            })
            .expectJson({
                event: "error_channel", channelName: "/test/socket",
                payload: {
                    message: "choke on my balls",
                    code: 403
                }
            }).close()
            .expectClosed();

        server.close();
        expect(endpoint['_channels']).toHaveLength(1);
    });

    it('should be able to track the presence of its users', async () => {
        const {socket, server, createPondChannel} = createPondSocket();
        expect(server).toBeDefined();

        const endpoint = socket.createEndpoint('/api/:room', (_, res) => {
            res.accept();
        });

        const channel = createPondChannel();

        channel.onJoinRequest((_, res) => {
            res.accept().trackPresence({
                status: 'online',
            });
        });

        endpoint.useChannel('/test/:room', channel);

        const message: ClientMessage = {
            action: ClientActions.JOIN_CHANNEL,
            channelName: '/test/socket',
            event: 'TEST', payload: {}
        }

        await request(server)
            .ws('/api/socket')
            .expectUpgrade(res => expect(res.statusCode).toBe(101))
            .sendJson(message)
            .expectJson({
                event: 'presence_change',
                channelName: '/test/socket',
                payload: {
                    type: 'join',
                    changed: {
                        status: 'online',
                    },
                    presence: [{
                        status: 'online',
                    }]
                }
            }).close()
            .expectClosed();

        server.close();
        expect(endpoint['_channels']).toHaveLength(1);
    });
});
