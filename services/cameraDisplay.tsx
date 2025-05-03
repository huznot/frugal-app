import * as FileSystem from 'expo-file-system';
import { searchProducts, ProductResult } from './cameraSearch';
import { LocationData } from './locationService';

// API Keys
const GEMINI_API_KEY = "REDACTED";

export type ProcessImageResult = {
    productInfo: {
        name: string;
        brand?: string;
        size?: string;
        weight?: string;
    };
    storeResults: ProductResult[];
} | null;

/**
 * Extracts product information from an image using Gemini API
 * @param imagePath Path to the image file
 * @returns Product information or null if extraction fails
 */
export const getProductInfoFromImage = async (imagePath: string): Promise<{ name: string; brand?: string; size?: string; weight?: string; } | null> => {
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
                            text: "You will receive an image of a product. Look at the product and its packaging. Return ONLY a single sentence describing the product, including the brand name and product name if visible. For example: 'Old Spice Pure Sport Deodorant' or 'Coca-Cola Classic 2L'. Do not include any other text or formatting."
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
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        const productDescription = result.candidates[0].content.parts[0].text.trim();
        console.log("Gemini response:", productDescription);
        
        return {
            name: productDescription,
            brand: undefined,
            size: undefined,
            weight: undefined
        };
    } catch (error: any) {
        console.error("Failed to extract product information:", error);
        if (error.response?.data?.error) {
            console.error("\nAPI Error Details:", error.response.data.error);
        }
        return null;
    }
};

/**
 * Processes an image to extract product information and search for it
 * @param imagePath Path to the image file
 * @param userLocation Optional user location for distance calculation
 * @returns Product information and store results
 */
export const processImage = async (imagePath: string, userLocation?: LocationData): Promise<ProcessImageResult> => {
    try {
        // Get product information from the image
        const productInfo = await getProductInfoFromImage(imagePath);
        
        if (!productInfo) {
            console.error("Failed to detect product information from image");
            return null;
        }
        
        // Create search query from product information
        const searchQuery = `${productInfo.brand ? productInfo.brand + ' ' : ''}${productInfo.name} ${productInfo.size || ''} ${productInfo.weight || ''}`.trim();
        
        // Search for the product in local stores
        const storeResults = await searchProducts(searchQuery, userLocation);
        
        return {
            productInfo,
            storeResults
        };
    } catch (error) {
        console.error("Error processing image:", error);
        return null;
    }
};
