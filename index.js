import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import { rateLimit } from 'express-rate-limit'
import fs from 'fs';
import typeDefs from './schema.js';
import resolvers from './resolvers.js';
import DB from './db.js';
import { startPolling } from './indexer.js';
import { CHAINS } from './config.js';
import logger from './logger.js';

if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
}

const dbs = {};
for (const chain in CHAINS) {
    dbs[chain] = new DB(chain);
}

startPolling(dbs);

const bannedIPs = new Map();

const app = express();

const limiter = rateLimit({
	windowMs: 10000,
	limit: 15,
	standardHeaders: 'draft-6',
    handler: (req, res) => {
        const ip = req.headers['x-forwarded-for'] || req.ip;

        const now = Date.now();
        let data = bannedIPs.get(ip) || { offenseCount: 0, lastOffense: 0, banUntil: 0 };
        
        if (now - data.lastOffense > 3600000) { // No offenses in last hour
            data.offenseCount = 0;
        }
        data.offenseCount++;
        data.lastOffense = now;
        const banDuration = 60000 * Math.pow(2, data.offenseCount - 1); // starts at 1min, exponential increase based on offense count
        data.banUntil = now + banDuration;
        bannedIPs.set(ip, data);

        logger.error('IP rate limited', {ip, data});

        res.set('Retry-After', Math.ceil(banDuration / 1000));
        res.status(429);
        res.json({'status': 'Rate limit reached'});
    },
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || req.ip;
    }
})

app.use((req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.ip;
    const data = bannedIPs.get(ip);
    if (data && Date.now() < data.banUntil) {
        res.status(429).json({status: 'Forbidden'});
        return;
    }
    next();
});

app.use(limiter)

// ApolloServer with dynamic context
const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
        const chain = req.chain;
        if (!chain || !dbs[chain]) {
            throw new Error(`Invalid chain: ${chain}`);
        }
        return { db: dbs[chain] };
    },
});
await server.start();

const handler = server.getMiddleware({ path: '/' });
for (const chain in CHAINS) {
    app.use(`/graphql/${chain}`, (req, res, next) => {
        req.chain = chain;
        handler(req, res, next);
    });
}

app.listen(4000, () => {
    logger.info('Server started on port 4000');
});