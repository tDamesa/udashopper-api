import * as AWS  from 'aws-sdk'
import * as express from "express";
import * as cors from "cors";
import * as serverless from "serverless-http";
import { expressjwt, GetVerificationKey } from "express-jwt";
import * as jwks  from "jwks-rsa";
import * as uuid  from "uuid";
import {captureAWS} from 'aws-xray-sdk';

const XAWS = captureAWS(AWS);

const checkJwt = expressjwt({
  secret: jwks.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: "https://dev-wh685a43.us.auth0.com/.well-known/jwks.json",
  }) as GetVerificationKey,
  audience: "https://iw2q1o07x8.execute-api.us-east-1.amazonaws.com",
  issuer: "https://dev-wh685a43.us.auth0.com/",
  algorithms: ["RS256"],
});

const app = express();
app.use(express.json());
app.use(cors());
app.options("*", cors());

const LISTINGS_TABLE = process.env.LISTINGS_TABLE!;
const dynamoDbClientParams = {} as any;
if (process.env.IS_OFFLINE) {
  dynamoDbClientParams.region = "localhost";
  dynamoDbClientParams.endpoint = "http://localhost:8000";
}
const dynamoDbClient = new XAWS.DynamoDB.DocumentClient(dynamoDbClientParams);
const s3 = new XAWS.S3({
  signatureVersion: "v4",
});

app.get("/api/listings", async function (_req, res) {
  const params = {
    TableName: LISTINGS_TABLE,
  };

  try {
    const { Items } = await dynamoDbClient.scan(params).promise();
    res.json(Items);
  } catch (error) {
    res.status(500).json({ error: "Could not retrieve listing" });
  }
});

app.get("/api/my-listings", checkJwt, async function (req: any, res) {
  const params = {
    TableName: LISTINGS_TABLE,
    FilterExpression: "userId = :userId",
    ExpressionAttributeValues: {
      ":userId": req.auth.sub,
    },
  };

  try {
    const { Items } = await dynamoDbClient.scan(params).promise();
    if (Items) {
      res.json(Items);
    } else {
      res.status(404).json({ error: 'Could not find a listing with provided "id"' });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Could not retrieve listing" });
  }
});

app.post("/api/listings", checkJwt, async function (req: any, res) {
  const { id, title, price, description, imageUrls, numberOfImages } = req.body;
  const userId = req.auth.sub
  if (typeof title !== "string") {
    return res.status(400).json({ error: '"title" must be a string' });
  }
  
  const item = { id: id || uuid.v4(), userId, title, price, description, imageUrls };
  let uploadUrls = [];
  if (numberOfImages) { 
    const imageIds = [...Array(numberOfImages)].map(_ => uuid.v4());
    uploadUrls = getUploadUrl(imageIds);
    item.imageUrls = imageIds.map((imageId) =>`https://${process.env.IMAGES_S3_BUCKET}.s3.amazonaws.com/${imageId}`);
    console.log(item.imageUrls);
  }

  const params = {
    TableName: LISTINGS_TABLE,
    Item: item,
  };

  try {
    await dynamoDbClient.put(params).promise();
    return res.json({item, uploadUrls});
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Could not create listing" });
  }
});

app.delete("/api/listings/:id", checkJwt, async function (req: any, res) {
  const { id } = req.params;
  const params = {
    TableName: LISTINGS_TABLE,
    Key: { id, userId: req.auth.sub },
  };

  try {
    const { Item } = await dynamoDbClient.get(params).promise();
    if (!Item) return res.status(404).json({ error: "Listing not found." });
    if (Item.userId !== req.auth.sub) return res.status(401).json({ error: "Unauthorized." });

    await dynamoDbClient.delete(params).promise();
    return res.status(202);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Could not create listing" });
  }
});

async function listingsExist(id, userId) {
  const result = await dynamoDbClient
    .get({
      TableName: LISTINGS_TABLE,
      Key: {
        id,
        userId,
      },
    })
    .promise();
  return !!result.Item;
}

function getUploadUrl(imageIds) {
  return imageIds.map((imageId, i) =>
    s3.getSignedUrl("putObject", {
      Bucket: process.env.IMAGES_S3_BUCKET,
      Key: imageId,
      Expires: 300,
    })
  );
}

app.use((req, res, next) => {
  return res.status(404).json({
    error: "Not Found",
  });
});

module.exports.handler = serverless(app);
