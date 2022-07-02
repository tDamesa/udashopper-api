export interface Listing {
    id?: string;
    userId?: string;
    title: string;
    price: number;
    description: string;
    imageUrls?: string[];
}