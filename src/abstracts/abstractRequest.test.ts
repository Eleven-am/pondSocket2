import {AbstractRequest} from "./abstractRequest";

const createMockChannelEngine = () => {
    return {
        name: 'test',
        getAssigns: () => ({}),
        getPresence: () => ({})
    } as any;
}

describe('AbstractRequest', () => {
    it('should be able to be instantiated', () => {
        const request = new AbstractRequest('/test', createMockChannelEngine());
        expect(request).toBeTruthy();
        expect(request.channelNme).toBe('test');
        expect(request.assigns).toEqual({});
        expect(request.presence).toEqual({});
    });

    it('should be able to parse queries', () => {
        const request = new AbstractRequest('/1234?choke=balls', createMockChannelEngine());
        expect(request.event).toEqual({
            event: '/1234?choke=balls',
            params: {},
            query: {}
        });
        expect(request._parseQueries('/:id')).toBe(true);
        expect(request.event).toEqual({
            event: '/1234?choke=balls',
            params: {id: '1234'},
            query: {choke: 'balls'}
        });
    });
});
