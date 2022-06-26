const AWS = require("aws-sdk");
const express = require("express");
var cors = require("cors");
const serverless = require("serverless-http");
const { expressjwt: jwt } = require("express-jwt");
const jwks = require("jwks-rsa");

const checkJwt = jwt({
  secret: jwks.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: "https://dev-wh685a43.us.auth0.com/.well-known/jwks.json",
  }),
  audience: "https://iw2q1o07x8.execute-api.us-east-1.amazonaws.com",
  issuer: "https://dev-wh685a43.us.auth0.com/",
  algorithms: ["RS256"],
});

const app = express();
app.use(express.json());
app.use(cors());
app.options("*", cors());

const LISTINGS_TABLE = process.env.LISTINGS_TABLE;
const dynamoDbClientParams = {};
if (process.env.IS_OFFLINE) {
  dynamoDbClientParams.region = "localhost";
  dynamoDbClientParams.endpoint = "http://localhost:8000";
}
const dynamoDbClient = new AWS.DynamoDB.DocumentClient(dynamoDbClientParams);

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

app.get("/api/my-listings", checkJwt, async function (req, res) {
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

app.post("/api/listings", checkJwt, async function (req, res) {
  const { id, title, price, images, description } = req.body;
  if (typeof id !== "string") {
    return res.status(400).json({ error: '"id" must be a string' });
  } else if (typeof title !== "string") {
    return res.status(400).json({ error: '"title" must be a string' });
  }

  const item = { id, title, price, images, description, userId: req.auth.sub };
  const params = {
    TableName: LISTINGS_TABLE,
    Item: item,
  };

  try {
    await dynamoDbClient.put(params).promise();
    return res.json(item);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Could not create listing" });
  }
});

app.delete("/api/listings/:id", checkJwt, async function (req, res) {
  const { id } = req.params;
  console.log({ id, userId: req.auth.sub });
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

app.use((req, res, next) => {
  return res.status(404).json({
    error: "Not Found",
  });
});

module.exports.handler = serverless(app);
