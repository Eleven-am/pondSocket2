import {ChannelEngine, InternalChannelEvent, UserData} from "./channelEngine";
import {PondMessage} from "../abstracts/abstractResponse";
import {AbstractRequest} from "../abstracts/abstractRequest";

export class ChannelRequest extends AbstractRequest {
    private readonly _internalEvent: InternalChannelEvent;

    constructor(event: InternalChannelEvent, engine: ChannelEngine) {
        super(event.event, engine, event.payload);
        this._internalEvent = event;
    }

    public get internalEvent(): PondMessage {
        return this._internalEvent.payload;
    }

    public get user(): UserData {
        const assigns = this._engine.getUserData(this._internalEvent.sender);

        if (!assigns)
            throw new Error(`ChannelRequest: User with id ${this._internalEvent.sender} does not exist in channel ${this._engine.name}`);

        return assigns;
    }
}
