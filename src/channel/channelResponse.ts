import {PondMessage, PondResponse} from "../abstracts/abstractResponse";
import {ChannelEngine, InternalChannelEvent, PondAssigns} from "./channelEngine";
import {PondPresence} from "../presence/presenceEngine";

export class ChannelResponse extends PondResponse {
    private readonly _event: InternalChannelEvent;
    private readonly _engine: ChannelEngine;
    private _hasExecuted: boolean = false;

    constructor(event: InternalChannelEvent, engine: ChannelEngine) {
        super();
        this._event = event;
        this._engine = engine;
    }

    /**
     * @desc Checks if the response has been sent
     */
    public get responseSent(): boolean {
        return this._hasExecuted;
    }

    /**
     * @desc Accepts the request and optionally assigns data to the client
     * @param assigns - the data to assign to the client
     */
    public accept(assigns?: PondAssigns): ChannelResponse {
        this._manageAssigns(assigns);
        this._hasExecuted = true;
        return this;
    }

    /**
     * @desc Rejects the request and optionally assigns data to the client
     * @param message - the error message
     * @param errorCode - the error code
     * @param assigns - the data to assign to the client
     */
    public reject(message?: string, errorCode?: number, assigns?: PondAssigns): ChannelResponse {
        this._manageAssigns(assigns);
        const text = message || 'Unauthorized request';
        this._engine.sendMessage('channel', [this._event.sender], 'error_channel', {message: text, code: errorCode || 403});
        this._hasExecuted = true;
        return this;
    }

    /**
     * @desc Emits a direct message to the client
     * @param event - the event name
     * @param payload - the payload to send
     * @param assigns - the data to assign to the client
     */
    public send(event: string, payload: PondMessage, assigns?: PondAssigns) {
        this._engine.sendMessage('channel', [this._event.sender], event, payload);
        return this.accept(assigns);
    }

    /**
     * @desc Sends a message to all clients in the channel
     * @param event - the event to send
     * @param payload - the payload to send
     */
    public broadcast(event: string, payload: PondMessage): ChannelResponse {
        this._engine.sendMessage(this._event.sender, 'all_users', event, payload);
        return this;
    }

    /**
     * @desc Sends a message to all clients in the channel except the client making the request
     * @param event - the event to send
     * @param payload - the payload to send
     */
    public broadcastFromUser(event: string, payload: PondMessage): ChannelResponse {
        this._engine.sendMessage(this._event.sender, 'all_except_sender', event, payload);
        return this;
    }

    /**
     * @desc Sends a message to a set of clients in the channel
     * @param event - the event to send
     * @param payload - the payload to send
     * @param userIds - the ids of the clients to send the message to
     */
    public sendToUsers(event: string, payload: PondMessage, userIds: string[]): ChannelResponse {
        this._engine.sendMessage(this._event.sender, userIds, event, payload);
        return this;
    }

    /**
     * @desc Tracks a user's presence in the channel
     * @param presence - the initial presence data
     * @param userId - the id of the user to track
     */
    public trackPresence(presence: PondPresence, userId?: string): ChannelResponse {
        this._engine.trackPresence(userId || this._event.sender, presence);
        return this;
    }

    /**
     * @desc Updates a user's presence in the channel
     * @param presence - the updated presence data
     * @param userId - the id of the user to update
     */
    public updatePresence(presence: PondPresence, userId?: string): ChannelResponse {
        this._engine.updatePresence(userId || this._event.sender, presence);
        return this;
    }

    /**
     * @desc Removes a user's presence from the channel
     * @param userId - the id of the user to remove
     */
    public untrackPresence(userId?: string): ChannelResponse {
        userId = userId || this._event.sender;
        try {
            this._engine.untrackPresence(userId);
        } catch (e: any) {
            this._engine.sendMessage('channel', [userId], 'error_channel', {message: e.message, code: 500});
        }

        return this;
    }

    /**
     * @desc Evicts a user from the channel
     * @param reason - the reason for the eviction
     * @param userId - the id of the user to evict,
     */
    public evictUser(reason: string, userId?: string): void {
        this._engine.kickUser(userId || this._event.sender, reason);
        this._hasExecuted = true;
    }

    /**
     * @desc Closes the channel from the server side for all clients
     * @param reason - the reason for closing the channel
     */
    public closeChannel(reason: string): void {
        this._engine.destroy(reason);
        this._hasExecuted = true;
    }

    /**
     * @desc Gets the event that triggered the response
     * @param assigns - the data to assign to the client
     * @private
     */
    private _manageAssigns(assigns?: PondAssigns): void {
        if (assigns)
            this._engine.updateAssigns(this._event.sender, assigns);
    }
}
