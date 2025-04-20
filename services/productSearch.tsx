const API_KEY = "mp7mEuhuPqSJT82MXQNXpmMF";
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

interface ProductResult {
  title: string;
  price: string;
  seller: string;
  rating?: string;
  reviews?: string;
  thumbnail?: string;
  product_link?: string;
}

const containsStoreName = (seller: string): boolean => {
  const sellerLower = seller.toLowerCase();
  return TARGET_STORES.some(store => sellerLower.includes(store.toLowerCase()));
};

export const searchProducts = async (query: string): Promise<ProductResult[]> => {
  try {
    const params = new URLSearchParams({
      engine: 'google_shopping',
      q: query,
      api_key: API_KEY,
      location: 'Winnipeg, Manitoba, Canada',
      google_domain: 'google.ca',
      gl: 'ca',
      hl: 'en'
    });

    const response = await fetch(`https://www.searchapi.io/api/v1/search?${params.toString()}`);
    const data = await response.json();

    if (data?.shopping_results) {
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