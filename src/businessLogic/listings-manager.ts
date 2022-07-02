import { ListingsAccess } from '../dataLayer/listings-access';
import { Listing } from '../types';
import * as uuid from 'uuid';

const listingsAccess = new ListingsAccess();

export class ListingsManager {
  async getListings (userId?: string) {
    return await listingsAccess.getAllListings(userId ? { userId } : undefined);
  }

  async getListing (id: string, userId: string) {
    return await listingsAccess.getListing(id, userId);
  }
    
  async createListing (listing: Listing, userId: string, numberOfImages?: number) {
    const imageIds = [...Array(numberOfImages)].map((_) => uuid.v4());
    listing.id = uuid.v4();
    listing.imageUrls = imageIds.map((imageId) => `https://${process.env.IMAGES_S3_BUCKET}.s3.amazonaws.com/${imageId}`);
    listing.userId = userId;
    await listingsAccess.createOrUpdateListing(listing);
    
    return {
      listing,
      uploadUrls: listingsAccess.getUploadUrls(imageIds),
    };
  }

  async updateListing(listing: Listing) {
    await listingsAccess.createOrUpdateListing(listing);
  }

  async deleteListing(id: string, userId: string) {
    const listing = await listingsAccess.getListing(id, userId);
    if (!listing) return false;
    await listingsAccess.deleteListing(id, userId);
    return true;
  }
}
