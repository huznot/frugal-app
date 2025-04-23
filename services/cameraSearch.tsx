import axios from 'axios';

// API Key
const API_KEY = "mp7mEuhuPqSJT82MXQNXpmMF";

// Target stores to filter results
const TARGET_STORES = [
    "walmart",
    "safeway",
    "save on foods",
    "costco",
    "superstore",
    "shoppers drug mart",
    "pharmasave",
    "pharmacy",
    "sobeys",
    "no frills"
];

// Interface for product search results
export interface ProductResult {
    title: string;
    price: string;
    seller: string;
    rating?: string;
    reviews?: string;
    thumbnail?: string;
    product_link?: string;
}

/**
 * Checks if a seller name contains any of the target store names
 * @param seller The seller name to check
 * @returns Boolean indicating if the seller is a target store
 */
const containsStoreName = (seller: string): boolean => {
    const sellerLower = seller.toLowerCase();
    return TARGET_STORES.some(store => sellerLower.includes(store.toLowerCase()));
};

/**
 * Searches for products using the SearchAPI.io Google Shopping API
 * @param query The search query
 * @returns Array of product results from target stores
 */
export const searchProducts = async (query: string): Promise<ProductResult[]> => {
    try {
        const params = {
            engine: 'google_shopping',
            q: query,
            api_key: API_KEY,
            location: 'Winnipeg, Manitoba, Canada',
            google_domain: 'google.ca',
            gl: 'ca',
            hl: 'en'
        };

        const response = await axios.get('https://www.searchapi.io/api/v1/search', { params });
        const data = response.data;

        if (data.shopping_results) {
            return data.shopping_results
                .filter((product: any) => product.seller && containsStoreName(product.seller))
                .map((product: any) => ({
                    title: product.title,
                    price: product.price,
                    seller: product.seller,
                    rating: product.rating,
                    reviews: product.reviews,
                    thumbnail: product.thumbnail,
                    product_link: product.product_link
                }));
        }
        
        return [];
    } catch (error) {
        console.error('Error searching products:', error);
        throw error;
    }
}; 