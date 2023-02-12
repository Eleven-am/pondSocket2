import {PondPresence, PresenceEngine, UserPresences} from "../presence/presenceEngine";
import {Subject} from "../utils/subjectUtils";
import {ChannelResponse} from "./channelResponse";
import {ChannelRequest} from "./channelRequest";
import {PondMessage} from "../abstracts/abstractResponse";
import {MiddlewareFunction} from "../abstracts/middleware";

export type PondAssigns = Record<string, any>;
export type ChannelReceivers = 'all_users' | 'all_except_sender' | string[];
type ChannelSenders = 'channel' | string;

export type InternalChannelEvent = {
    sender: ChannelSenders;
    recipient: ChannelReceivers;
    payload: PondMessage;
    event: string;
}

export interface ChannelEvent {
    event: string;
    payload: PondMessage;
    channelName: string;
}

export interface UserAssigns {
    [userId: string]: PondAssigns;
}

export interface UserData {
    assigns: PondAssigns;
    presence: PondPresence;
    id: string;
}

export type ParentEngine = {
    destroyChannel: () => void;
    execute: MiddlewareFunction<ChannelRequest, ChannelResponse>;
}

export class ChannelEngine {
    public readonly name: string;
    private readonly _receiver: Subject<InternalChannelEvent>;
    private _presenceEngine: PresenceEngine | undefined;
    private readonly _users: Map<string, PondAssigns>;
    private readonly _parentEngine: ParentEngine;

    constructor(name: string, parent: ParentEngine) {
        this.name = name;
        this._receiver = new Subject<InternalChannelEvent>();
        this._users = new Map<string, PondAssigns>();
        this._parentEngine = parent;
    }

    /**
     * @desc Adds a user to the channel
     * @param userId - The id of the user to add
     * @param assigns - The assigns to add to the user
     * @param onMessage - The callback to call when a message is received
     */
    public addUser(userId: string, assigns: PondAssigns, onMessage: (event: ChannelEvent) => void) {
        const oldUser = this._users.get(userId);
        if (oldUser)
            throw new Error(`ChannelEngine: User with id ${userId} already exists in channel ${this.name}`);

        this._users.set(userId, assigns);
        return this._subscribe(userId, onMessage);
    }

    /**
     * @desc Removes a user from the channel
     * @param userId - The id of the user to remove
     * @param isPond - Whether the user is a pond or not
     */
    public removeUser(userId: string, isPond = false) {
        const user = this._users.get(userId);
        if (user) {
            this._users.delete(userId);
            this.untrackPresence(userId, true);
            this._receiver.unsubscribe(userId);

            if (this._users.size === 0)
                this._parentEngine.destroyChannel();
        } else if (!isPond)
            throw new Error(`ChannelEngine: User with id ${userId} does not exist in channel ${this.name}`);
    }

    /**
     * @desc Kicks a user from the channel
     * @param userId - The id of the user to kick
     * @param reason - The reason for kicking the user
     */
    public kickUser(userId: string, reason: string) {
        this._send('channel', [userId], 'kicked_out', {
            message: 'You have been kicked out of the channel',
            reason: reason
        });
        this.removeUser(userId);
        this._send('channel', 'all_users', 'kicked', {
            userId: userId, reason: reason
        });
    }

    /**
     * @desc Self destructs the channel
     * @param reason - The reason for self destructing the channel
     */
    public destroy(reason: string) {
        this._send('channel', 'all_users', 'destroyed', {
            message: 'Channel has been destroyed',
            reason: reason
        });
        this._parentEngine.destroyChannel();
        this._users.forEach((_, userId) => this._receiver.unsubscribe(userId));
    }

    /**
     * @desc Begins tracking a user's presence
     * @param userId - The id of the user to track
     * @param presence - The initial presence of the user
     */
    public trackPresence(userId: string, presence: PondPresence) {
        this._presenceEngine = this._presenceEngine || new PresenceEngine();
        if (!this._users.has(userId))
            throw new Error(`ChannelEngine: User with id ${userId} does not exist in channel ${this.name}`);

        if (this._presenceEngine.getUserPresence(userId))
            throw new Error(`ChannelEngine: User with id ${userId} already has a presence subscription in channel ${this.name}`);

        this._presenceEngine.trackPresence(userId, presence, change => {
            this._send('channel', [userId], 'presence_change', change);
        });
    }

    /**
     * @desc Updates a user's presence
     * @param userId - The id of the user to update
     * @param presence - The new presence of the user
     */
    public updatePresence(userId: string, presence: PondPresence) {
        if (!this._users.has(userId))
            throw new Error(`ChannelEngine: User with id ${userId} does not exist in channel ${this.name}`);

        if (this._presenceEngine)
            this._presenceEngine.updatePresence(userId, presence);

        else
            throw new Error('ChannelEngine: Presence engine is not initialized');
    }

    /**
     * @desc Updates a user's assigns
     * @param userId - The id of the user to update
     * @param assigns - The new assigns of the user
     */
    public updateAssigns(userId: string, assigns: PondAssigns) {
        const user = this._users.get(userId);
        if (user) {
            this._users.set(userId, Object.assign({}, user, assigns));
        } else
            throw new Error(`ChannelEngine: User with id ${userId} does not exist in channel ${this.name}`);
    }

    /**
     * @desc Gets the data of a user
     * @param userId - The id of the user to get
     */
    public getUserData(userId: string): UserData | undefined {
        const presence = this._presenceEngine ? this._presenceEngine.getUserPresence(userId) : {};
        if (this._users.has(userId))
            return {
                id: userId,
                assigns: this._users.get(userId)!,
                presence: presence || {}
            };
        else
            return undefined;
    }

    /**
     * @desc Gets the assign data of all users
     */
    public getAssigns(): UserAssigns {
        const assigns: UserAssigns = {};
        this._users.forEach((value, key) => {
            assigns[key] = value;
        });
        return assigns;
    }

    /**
     * @desc Gets the presence data of all users
     */
    public getPresence(): UserPresences {
        if (this._presenceEngine)
            return this._presenceEngine.getPresence();
        else
            return {};
    }

    /**
     * @desc Broadcasts a message to a specified set of users, from a specified sender
     * @param recipient - The users to send the message to
     * @param event - The event name
     * @param payload - The payload of the message
     * @param sender - The sender of the message
     * @param ignoreMiddleware - Whether or not to ignore middleware
     */
    public broadcast(recipient: ChannelReceivers, event: string, payload: PondMessage, sender: ChannelSenders = 'channel', ignoreMiddleware: boolean = false) {
        if (sender === 'channel' || ignoreMiddleware)
            this._send(sender, recipient, event, payload);

        else if (!this._users.has(sender))
            throw new Error(`ChannelEngine: User with id ${sender} does not exist in channel ${this.name}`);

        else {
            const responseEvent: InternalChannelEvent = {
                event: event,
                payload: payload,
                sender: sender,
                recipient: recipient
            }

            const request = new ChannelRequest(responseEvent, this);
            const response = new ChannelResponse(responseEvent, this, data => {
                if (data)
                    this._send(sender, recipient, event, payload);
            });

            this._parentEngine.execute(request, response, () => {
                this._send('channel', [sender], 'error_no_handler', {
                    message: 'A handler did not respond to the event',
                    code: 404
                });
            });
        }
    }

    /**
     * @desc Stops tracking a user's presence
     * @param userId - The id of the user to untrack
     * @param isPond - Whether the user is a pond
     */
    public untrackPresence(userId: string, isPond: boolean = false) {
        if (this._presenceEngine)
            if (isPond && this._presenceEngine.getUserPresence(userId))
                this._presenceEngine.removePresence(userId);
            else if (!isPond)
                this._presenceEngine.removePresence(userId);
    }

    /**
     * @desc Subscribes to a user's messages
     * @param userId - The id of the user to subscribe to
     * @param onMessage - The callback to call when a message is received
     * @private
     */
    private _subscribe(userId: string, onMessage: (event: ChannelEvent) => void) {
        this._receiver.subscribe(userId, event => {
            if (event.recipient.includes(userId))
                onMessage({
                    event: event.event,
                    payload: event.payload,
                    channelName: this.name
                });
        });
    }

    /**
     * @desc Sends a message to a specified set of users, from a specified sender
     * @param sender - The sender of the message
     * @param recipient - The users to send the message to
     * @param event - The event name
     * @param payload - The payload of the message
     * @private
     */
    private _send(sender: ChannelSenders, recipient: ChannelReceivers, event: string, payload: PondMessage) {
        const allUsers = Array.from(this._users.keys());
        let users: string[];

        switch (recipient) {
            case 'all_users':
                users = allUsers;
                break;
            case 'all_except_sender':
                if (sender === 'channel')
                    throw new Error(`ChannelEngine: Cannot send to all users except sender when sender is channel`);

                users = allUsers.filter(user => user !== sender);
                break;
            default:
                const absentUsers = recipient.filter(user => !allUsers.includes(user));
                if (absentUsers.length > 0)
                    throw new Error(`ChannelEngine: Users ${absentUsers.join(', ')} are not in channel ${this.name}`);

                users = recipient;
        }

        this._receiver.next({
            sender: sender,
            recipient: users,
            payload: payload,
            event: event
        });
    }
}
