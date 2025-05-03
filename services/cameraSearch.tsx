import { LocationData } from './locationService';
import { calculateDistance } from './locationService';

// API Key
const API_KEY = "KQSjK9LWi29vdzggS11ATSJJ";

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
    distance?: string;
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
 * Sorts products by price in ascending order
 * @param products Array of products to sort
 * @returns Sorted array of products
 */
const sortProductsByPrice = (products: ProductResult[]): ProductResult[] => {
    return products.sort((a, b) => {
        // Remove currency symbols and convert to numbers
        const priceA = parseFloat(a.price.replace(/[^0-9.]/g, ''));
        const priceB = parseFloat(b.price.replace(/[^0-9.]/g, ''));
        return priceA - priceB;
    });
};

/**
 * Searches for products using the SearchAPI.io Google Shopping API
 * @param query The search query
 * @param userLocation Optional user location for distance calculation
 * @returns Array of product results from target stores
 */
export const searchProducts = async (query: string, userLocation?: LocationData): Promise<ProductResult[]> => {
    try {
        const params = new URLSearchParams({
            engine: 'google_shopping',
            q: query,
            api_key: API_KEY,
            location: 'Winnipeg, Manitoba, Canada', // Always use Winnipeg for search
            google_domain: 'google.ca',
            gl: 'ca',
            hl: 'en',
            num: '20' // Limit results to 20 to avoid rate limiting
        });

        const response = await fetch(`https://www.searchapi.io/api/v1/search?${params.toString()}`);
        
        if (!response.ok) {
            console.error('Search API error:', await response.text());
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();

        if (!data?.shopping_results) {
            console.error('No shopping results in response:', data);
            return [];
        }

        const filteredProducts = data.shopping_results
            .filter((product: any) => product.seller && containsStoreName(product.seller))
            .map((product: any) => ({
                title: product.title,
                price: product.price,
                seller: product.seller,
                rating: product.rating,
                reviews: product.reviews,
                thumbnail: product.thumbnail,
                product_link: product.product_link,
                distance: userLocation ? undefined : 'Distance unavailable'
            }));
        
        return sortProductsByPrice(filteredProducts);
    } catch (error) {
        console.error('Error searching products:', error);
        // Return empty array instead of throwing to prevent app crash
        return [];
    }
}; 