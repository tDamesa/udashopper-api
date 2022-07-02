import * as express from 'express';
import * as cors from 'cors';
import * as serverless from 'serverless-http';
import { expressjwt, GetVerificationKey } from 'express-jwt';
import * as jwks from 'jwks-rsa';
import { captureAsyncFunc } from 'aws-xray-sdk';
import * as awsServerlessExpressMiddleware from 'aws-serverless-express/middleware';
import * as xrayExpress from 'aws-xray-sdk-express';
import { Listing } from './types';
import { TypedResponse } from './types';
import { AUDIENCE, ISSUER_BASE_URL } from './constants/auth0';
import pino from 'pino';
import { ListingsManager } from './businessLogic/listings-manager';

const listingsManager = new ListingsManager();

const checkJwt = expressjwt({
  secret: jwks.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `${ISSUER_BASE_URL}.well-known/jwks.json`,
  }) as GetVerificationKey,
  audience: AUDIENCE,
  issuer: ISSUER_BASE_URL,
  algorithms: ['RS256'],
});

const app = express();

app.use(xrayExpress.openSegment('handler'));
app.use(awsServerlessExpressMiddleware.eventContext());

const logger = pino({
  level: 'trace',
  name: process.env.FUNC_NAME,
});
app.use((req: any, _res, next) => {
  req.logger = logger.child({
    requestId: req.apiGateway.context.awsRequestId,
  });
  next();
});

app.use(express.json());
app.use(cors());
app.options('*', cors());

app.get('/api/listings', async (_req, res: TypedResponse<Listing[]>) =>
  captureAsyncFunc('/api/listings', async (subSegment) => {
    try {
      res.json(await listingsManager.getListings());
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Could not retrieve listing' });
    }
    subSegment?.close();
  })
);

app.get('/api/my-listings', checkJwt, async (req, res: TypedResponse<Listing[]>) =>
  captureAsyncFunc('/api/my-listings', async (subSegment) => {
    try {
      res.json(await listingsManager.getListings(req.auth.sub));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Could not retrieve listing' });
    }
    subSegment?.close();
  })
);

app.post('/api/listings/create', checkJwt, async (req, res: TypedResponse<{ listing: Listing; uploadUrls?: string[] }>) =>
  captureAsyncFunc('/api/my-listings', async (subSegment) => {
    try {
      const { title, price, description, numberOfImages } = req.body;
      const userId = req.auth.sub;
      res.json(await listingsManager.createListing({ title, price, description }, userId, numberOfImages));
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Could not create listing' });
    }
    subSegment?.close();
  })
);

app.post('/api/listings/update', checkJwt, async (req, res: TypedResponse<Listing>) =>
  captureAsyncFunc('/api/my-listings', async (subSegment) => {
    try {
      const { id, title, price, description, imageUrls } = req.body;
      const userId = req.auth.sub;
      const listing = { id, userId, title, price, description, imageUrls };
      await listingsManager.updateListing(listing);
      res.json(listing);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Could not create listing' });
    }
    subSegment?.close();
  })
);

app.delete('/api/listings/:id', checkJwt, async (req, res) =>
  captureAsyncFunc('/api/listings/:id', async (subSegment) => {
    try {
      const { id } = req.params;
      const userId = req.auth.sub;
      if (await listingsManager.deleteListing(id, userId)) {
        res.status(202).json({success: true});
      } else {
        res.status(404).json({ error: 'Listing not found.' });
      }
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Could not create listing' });
    }
    subSegment?.close();
  })
);

app.use((_req, res) => {
  return res.status(404).json({
    error: 'Not Found',
  });
});

module.exports.handler = serverless(app);
