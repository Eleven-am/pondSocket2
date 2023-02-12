import {ChannelEngine, InternalChannelEvent, UserData} from "./channelEngine";
import {PondMessage} from "../abstracts/abstractResponse";
import {AbstractRequest} from "../abstracts/abstractRequest";

export class ChannelRequest extends AbstractRequest {
    private readonly _payload: InternalChannelEvent;

    constructor(event: InternalChannelEvent, engine: ChannelEngine) {
        super(event.event, engine);
        this._payload = event;
    }

    public get payload(): PondMessage {
        return this._payload.payload;
    }

    public get user(): UserData {
        const assigns = this._engine.getUserData(this._payload.sender);

        if (!assigns)
            throw new Error(`ChannelRequest: User with id ${this._payload.sender} does not exist in channel ${this._engine.name}`);

        return assigns;
    }
}
