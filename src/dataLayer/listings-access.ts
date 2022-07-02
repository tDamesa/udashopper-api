import * as AWS from 'aws-sdk';
import * as AWSXRay from 'aws-xray-sdk';
import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import { IMAGES_S3_BUCKET, IS_OFFLINE, LISTINGS_TABLE } from '../constants';
import { Listing } from '../types';

const XAWS = AWSXRay.captureAWS(AWS);
const s3 = new XAWS.S3({
  signatureVersion: 'v4',
});

export class ListingsAccess {
  private readonly docClient: DocumentClient;

  constructor(private readonly listingsTable = LISTINGS_TABLE) {
    this.docClient = !IS_OFFLINE ? new XAWS.DynamoDB.DocumentClient() : new XAWS.DynamoDB.DocumentClient({
      region: 'localhost',
      endpoint: 'http://localhost:8000',
    });
  }

  async getAllListings(filter?: {[key:string]: string}): Promise<Listing[]> {
    const { Items } = await this.docClient
      .scan(this.createScanInput(filter))
      .promise();
    return Items as Listing[];
  }

  async getListing(id: string, userId: string) {
    const {Item} = await this.docClient
      .get({
        TableName: LISTINGS_TABLE,
        Key: {
          id,
          userId,
        },
      })
      .promise();
    return  Item;
  }

  async createOrUpdateListing(listing: Listing): Promise<void> {
    await this.docClient
      .put({
        TableName: this.listingsTable,
        Item: listing,
      })
      .promise();
  }

  async deleteListing(id: string, userId: string) {
    await this.docClient
      .delete({
        TableName: LISTINGS_TABLE,
        Key: {
          id,
          userId,
        },
      })
      .promise();
  }

  createScanInput(filter?: { [key: string]: string; }) {
    const scanInput: AWS.DynamoDB.DocumentClient.ScanInput = {TableName: LISTINGS_TABLE};
    if (!filter) return scanInput;
    scanInput.FilterExpression = Object.keys(filter).map(key => `${key} = :${key}`).join(' AND ');
    scanInput.ExpressionAttributeValues = Object.keys(filter).reduce((acc, key) => {
      acc[`:${key}`] = filter[key];
      return acc;
    }, {});
    return scanInput;  
  }
    
  getUploadUrls(imageIds: string[]): string[] {
    return imageIds.map((imageId) =>
      s3.getSignedUrl('putObject', {
        Bucket: IMAGES_S3_BUCKET,
        Key: imageId,
        Expires: 300,
      })
    );
  }
}

