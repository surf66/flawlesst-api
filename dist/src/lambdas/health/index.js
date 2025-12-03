"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const handler = async () => {
    return {
        statusCode: 200,
        headers: {
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            status: 'ok',
            service: 'flawlesst-api',
            timestamp: new Date().toISOString(),
        }),
    };
};
exports.handler = handler;
