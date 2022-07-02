import pino from 'pino';

export default (level) => {
    return pino({
        level,
        name: process.env.FUNC_NAME,
    });
};
