import { Listing } from './';

export interface CreateListingResult {
  uploadUrls: string[];
  listing: Listing;
}