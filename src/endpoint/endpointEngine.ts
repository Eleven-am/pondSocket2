import {WebSocket, WebSocketServer} from "ws";
import {MatchPattern, PondPath, Resolver} from "../utils/matchPattern";
import {PondChannel, PondChannelManager, RequestCache, SocketCache} from "../pondChannel/pondChannel";
import {ChannelEngine, ChannelEvent} from "../channel/channelEngine";
import {IncomingHttpHeaders, IncomingMessage} from "http";
import internal from "stream";
import {EndpointResponse, PondConnectionResponseHandler} from "./endpointResponse";
import {PondMessage} from "../abstracts/abstractResponse";

interface PondChannelData {
    path: PondPath;
    manager: PondChannelManager;
}

export interface IncomingConnection {
    id: string;
    params: Record<string, string>
    query: Record<string, string>;
    headers: IncomingHttpHeaders;
    address: string;
}

export enum ClientActions {
    JOIN_CHANNEL = 'JOIN_CHANNEL',
    LEAVE_CHANNEL = 'LEAVE_CHANNEL',
    BROADCAST = 'BROADCAST',
}

export type ClientMessage = {
    action: ClientActions;
    channelName: string;
    event: string;
    payload: Record<string, any>;
    addresses?: string[];
}

export type EndpointHandler = (req: IncomingConnection, res: EndpointResponse) => void;

export class EndpointEngine {
    private readonly _server: WebSocketServer;
    private readonly _channels: PondChannelData[];
    private readonly _sockets: Set<SocketCache>;
    private readonly _matcher: MatchPattern;

    constructor(server: WebSocketServer) {
        this._server = server;
        this._channels = [];
        this._sockets = new Set();
        this._matcher = new MatchPattern();
    }

    /**
     * @desc Adds a new PondChannel to this path on this endpoint
     * @param path - The path to add the channel to
     * @param channel - The channel to add
     *
     * @example
     * endpoint.useChannel('/chat', pondChannelInstance);
     */
    public useChannel(path: PondPath, channel: PondChannel) {
        const manager = channel._buildManager();
        this._channels.push({path, manager});
    }

    /**
     * @desc List all clients connected to this endpoint
     */
    public listConnections() {
        return [...this._sockets].map(({clientId}) => clientId);
    }

    /**
     * @desc Gets all clients connected to this endpoint
     */
    public getClients() {
        return [...this._sockets];
    }

    /**
     * @desc Broadcasts a message to all clients connected to this endpoint
     * @param event - The event to broadcast
     * @param payload - The payload to broadcast
     */
    public broadcast(event: string, payload: PondMessage) {
        this._sockets.forEach(({socket}) => {
            const message: ChannelEvent = {event, payload, channelName: "SERVER"};
            this._sendMessage(socket, message);
        });
    }

    /**
     * @desc Closes specific clients connected to this endpoint
     * @param clientIds - The id for the client / clients to close
     */
    public closeConnection(clientIds: string | string[]) {
        const clients = typeof clientIds === "string" ? [clientIds] : clientIds;

        this.getClients()
            .forEach(({clientId, socket}) => {
                if (clients.includes(clientId)) socket.close();
            });
    }

    /**
     * @desc Authenticates the client to the endpoint
     * @param request - Incoming request
     * @param socket - Incoming socket
     * @param head - Incoming head
     * @param data - Incoming the data resolved from the handler
     * @param handler - The handler to use to authenticate the client
     */
    public _authoriseConnection(request: IncomingMessage, socket: internal.Duplex, head: Buffer, data: Resolver, handler: EndpointHandler) {
        const clientId = this._generateClientId();
        const req: IncomingConnection = {
            headers: request.headers, ...data, id: clientId
        };

        const resolver: PondConnectionResponseHandler = (assigns, data) => {
            if (data.error) {
                socket.write(`HTTP/1.1 ${data.error.code} ${data.error.message}\r\n\r\n`);
                return socket.destroy();
            }

            this._server.handleUpgrade(request, socket, head, (ws) => {
                this._server.emit("connection", ws);
                const socketCache: SocketCache = {
                    socket: ws, assigns: assigns, clientId: clientId
                };

                this._sockets.add(socketCache);
                this._manageSocket(socketCache);

                if (data.message) {
                    const newMessage: ChannelEvent = {
                        event: data.message.event, channelName: "SERVER", payload: data.message.payload
                    };

                    this._sendMessage(ws, newMessage);
                }
            });
        }

        const res = new EndpointResponse(resolver);
        handler(req, res);
    }

    /**
     * @desc Manages a new socket connection
     * @param cache - The socket cache
     * @private
     */
    private _manageSocket(cache: SocketCache) {
        const socket = cache.socket;
        socket.addEventListener("message", (message) => {
            this._readMessage(cache, message.data as string)
        });

        socket.addEventListener("close", () => {
            this._channels
                .forEach(({manager}) => manager.removeUser(cache.clientId));
        });

        socket.addEventListener("error", () => {
            this._channels
                .forEach(({manager}) => manager.removeUser(cache.clientId));
        });
    }

    /**
     * @desc Sends a message to a client
     * @param socket - The socket to send the message to
     * @param message - The message to send
     */
    private _sendMessage(socket: WebSocket, message: ChannelEvent) {
        socket.send(JSON.stringify(message));
    }

    /**
     * @desc Adds a new client to a channel on this endpoint
     * @param channel - The channel to add the client to
     * @param socket - The client to add to the channel
     * @param joinParams - The parameters to pass to the channel
     * @private
     */
    private _joinChannel(channel: string, socket: SocketCache, joinParams: Record<string, any>) {
        for (const {path, manager} of this._channels) {
            const match = this._matcher.parseEvent(path, channel);
            if (match) {
                const request: RequestCache = {
                    ...match, ...socket, joinParams: joinParams, channelName: channel
                };

                return manager.addUser(request);
            }
        }

        throw new Error(`GatewayEngine: Channel ${channel} does not exist`);
    }

    /**
     * @desc Executes a function on a channel
     * @param channel - The channel to execute the function on
     * @param handler - The function to execute
     * @private
     */
    private _execute<A>(channel: string, handler: ((manager: ChannelEngine) => A)): A {
        for (const {manager} of this._channels) {
            const isPresent = manager.listChannels().includes(channel);
            if (isPresent) return manager.execute(channel, handler);
        }

        throw new Error(`GatewayEngine: Channel ${channel} does not exist`);
    }

    /**
     * @desc Deals with a message sent from a client
     * @param cache - The socket cache of the client
     * @param message - The message to handle
     */
    private _handleMessage(cache: SocketCache, message: ClientMessage) {
        switch (message.action) {
            case "JOIN_CHANNEL":
                this._joinChannel(message.channelName, cache, message.payload);
                break;

            case "LEAVE_CHANNEL":
                this._execute(message.channelName, (channel) => {
                    channel.removeUser(cache.clientId);
                });
                break;

            case "BROADCAST":
                this._execute(message.channelName, (channel) => {
                    channel.onMessage(cache.clientId, message);
                });
                break;
        }
    }

    /**
     * @desc Handles a message sent from a client
     * @param cache - The socket cache of the client
     * @param message - The message to handle
     * @private
     */
    private _readMessage(cache: SocketCache, message: string) {
        const errorMessage: ChannelEvent = {
            event: "error", channelName: 'ENDPOINT', payload: {}
        };

        try {
            const data = JSON.parse(message) as ClientMessage;

            if (!data.action) errorMessage.payload = {
                message: "No action provided"
            };

            else if (!data.channelName) errorMessage.payload = {
                message: "No channel name provided"
            };

            else if (!data.payload) errorMessage.payload = {
                message: "No payload provided"
            };

            if (!this._isObjectEmpty(errorMessage.payload))
                this._sendMessage(cache.socket, errorMessage);

            else this._handleMessage(cache, data);

        } catch (e) {
            if (e instanceof SyntaxError) {
                errorMessage.payload = {
                    message: "Invalid JSON"
                }
                this._sendMessage(cache.socket, errorMessage);

            } else if (e instanceof Error) {
                errorMessage.payload = {
                    message: e.message,
                }

                this._sendMessage(cache.socket, errorMessage);
            }
        }
    }

    /**
     * @desc Checks if an object is empty
     * @param obj - The object to check
     * @private
     */
    private _isObjectEmpty(obj: Record<string, any>) {
        return Object.keys(obj).length === 0;
    }

    /**
     * @desc Generates a new client ID
     * @private
     */
    private _generateClientId() {
        let id = '';
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 21; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        return id;
    }
}
