import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import { searchProducts, ProductResult } from './cameraSearch';

// API Keys
const GEMINI_API_KEY = "REDACTED";
const BARCODE_LOOKUP_API_KEY = "10zg7wifwoxuoh939oddirtyizae1e";

export type ProcessImageResult = {
    productInfo: any;
    storeResults: ProductResult[];
} | null;

/**
 * Extracts UPC from an image using Gemini API
 * @param imagePath Path to the image file
 * @returns UPC string or null if extraction fails
 */
export const getUpcFromImage = async (imagePath: string): Promise<string | null> => {
    try {
        // Read the image file and convert to base64
        const base64Image = await FileSystem.readAsStringAsync(imagePath, {
            encoding: FileSystem.EncodingType.Base64,
        });

        // Gemini API endpoint
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        // JSON payload for Gemini
        const payload = {
            contents: [
                {
                    parts: [
                        {
                            text: "You will receive an image of a barcode. Output ONLY the UPC number in the barcode. Part of the UPC number is the single digit which could be to the very left and right of the barcode. So, the first number at the left of the barcode, the two bunch of numbers in the center, then the very last number at the very right of the barcode if applicable. Do NOT output anything else—no explanations, no extra text, just the UPC digits. Please double check and ensure that each digit is being ouputted or the program will fail."
                        },
                        {
                            inlineData: {
                                mimeType: "image/png",
                                data: base64Image
                            }
                        }
                    ]
                }
            ]
        };

        // Send POST request to Gemini
        const response = await axios.post(url, payload);
        const result = response.data;

        return result.candidates[0].content.parts[0].text.trim();
    } catch (error: any) {
        console.error("Failed to extract UPC:", error);
        if (error.response?.data?.error) {
            console.error("\nAPI Error Details:", error.response.data.error);
        }
        return null;
    }
};

/**
 * Looks up product information using UPC and searches local stores
 * @param upc The UPC code to look up
 * @returns Product data and store results
 */
export const lookupProductInfo = async (upc: string): Promise<{ productInfo: any, storeResults: ProductResult[] } | null> => {
    try {
        // Barcode Lookup API endpoint
        const url = `https://api.barcodelookup.com/v3/products?barcode=${upc}&formatted=y&key=${BARCODE_LOOKUP_API_KEY}`;
        
        const response = await axios.get(url);
        const data = response.data;
        
        const product = data.products[0];
        const brand = product?.brand || '';
        const title = product?.title || '';
        
        // Search for the product in local stores
        const searchQuery = `${brand} ${title}`;
        const storeResults = await searchProducts(searchQuery);
        
        // Log product details
        console.log(`\nProduct: ${title}`);
        console.log(`Brand: ${brand}`);
        console.log("\nAvailable in stores:");
        
        storeResults.forEach(result => {
            console.log(`\n- ${result.seller}: ${result.price}`);
            if (result.rating) {
                console.log(`  Rating: ${result.rating} (${result.reviews || '0'} reviews)`);
            }
            if (result.thumbnail) {
                console.log(`  Product Image: ${result.thumbnail}`);
            }
        });
        
        return {
            productInfo: data,
            storeResults
        };
        
    } catch (error) {
        console.error("Error looking up product information:", error);
        console.log("UPC:", upc);
        return null;
    }
};

/**
 * Processes an image to extract UPC and get product information
 * @param imagePath Path to the image file
 * @returns Product information and store results
 */
export const processImage = async (imagePath: string): Promise<ProcessImageResult> => {
    try {
        // First get the UPC from the image
        const upc = await getUpcFromImage(imagePath);
        
        if (!upc) {
            console.error("Failed to detect UPC from image");
            return null;
        }
        
        // Look up the product information
        return await lookupProductInfo(upc);
    } catch (error) {
        console.error("Error processing image:", error);
        return null;
    }
};
