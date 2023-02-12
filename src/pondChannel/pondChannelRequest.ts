import {AbstractRequest, EventObject} from "../abstracts/abstractRequest";
import {RequestCache} from "./pondChannel";
import {ChannelEngine, UserData} from "../channel/channelEngine";

export type JoinParams = Record<string, any>;

export class PondChannelRequest extends AbstractRequest {
    private readonly _payload: RequestCache;

    constructor(event: RequestCache, engine: ChannelEngine) {
        super(event.channelName, engine);
        this._payload = event;
    }

    public get joinParams(): JoinParams {
        return this._payload.joinParams;
    }

    public get user(): UserData {
        return {
            id: this._payload.clientId,
            assigns: this._payload.assigns,
            presence: {}
        }
    }

    public get event(): EventObject {
        return {
            event: this._payload.channelName,
            params: this._payload.params,
            query: this._payload.query
        };
    }
}
