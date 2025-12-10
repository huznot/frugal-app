import * as Location from 'expo-location';
import { ORS_API_KEY } from './env';

export interface LocationData {
  latitude: number;
  longitude: number;
}

// Store name mapping to clean up search API results
const STORE_NAME_MAPPING: { [key: string]: string } = {
  'walmartca': 'Walmart',
  'walmart.ca': 'Walmart',
  'shoppers drug mart': 'Shoppers Drug Mart',
  'shoppers': 'Shoppers Drug Mart',
  'voilà by sobeys': 'Sobeys',
  'voila by sobeys': 'Sobeys',
  'save on foods': 'Save On Foods',
  'superstore': 'Superstore',
  'costco': 'Costco',
  'no frills': 'No Frills',
  'safeway': 'Safeway',
  'pharmasave': 'Pharmasave',
  'pharmacy': 'Pharmacy'
};


export const getCurrentLocation = async (): Promise<LocationData> => {
  let { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Permission to access location was denied');
  }

  const location = await Location.getCurrentPositionAsync({});
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude
  };
};

export const calculateDistance = async (
  origin: LocationData,
  storeName: string,
  city: string // Add city parameter
): Promise<string> => {
  try {
    if (!ORS_API_KEY) {
      console.error('OpenRouteService API key is not configured. Set EXPO_PUBLIC_ORS_API_KEY in your .env file.');
      return 'Distance unavailable';
    }

    // Clean up store name and map to standard name
    const cleanStoreName = storeName.toLowerCase()
      .replace(/\./g, '') // Remove periods
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();

    // Find the best matching store name from our mapping
    const mappedStoreName = Object.entries(STORE_NAME_MAPPING).find(([key]) => 
      cleanStoreName.includes(key.toLowerCase())
    )?.[1] || cleanStoreName;

    console.log('Searching for store:', mappedStoreName);
    console.log('User location:', origin);

    // First, use OpenRouteService's geocoding to find the store location
    console.log("city name:", city);
    const geocodeResponse = await fetch(
      `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(mappedStoreName + ' ' + city)}&boundary.country=CA&layers=venue`
    );

    if (!geocodeResponse.ok) {
      console.error('Geocoding API error:', await geocodeResponse.text());
      return 'Distance unavailable';
    }

    const geocodeData = await geocodeResponse.json();
    console.log('Geocoding results:', geocodeData);

    if (!geocodeData.features || geocodeData.features.length === 0) {
      console.log('No store locations found');
      return 'Distance unavailable';
    }

    // Get the first (nearest) store location
    const storeLocation = {
      longitude: geocodeData.features[0].geometry.coordinates[0],
      latitude: geocodeData.features[0].geometry.coordinates[1]
    };

    console.log('Found store location:', storeLocation);
    console.log('Store name from geocoding:', geocodeData.features[0].properties.name);

    // Then use OpenRouteService to get actual walking distance
    const distanceResponse = await fetch(
      'https://api.openrouteservice.org/v2/directions/foot-walking',
      {
        method: 'POST',
        headers: {
          'Authorization': ORS_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          coordinates: [
            [origin.longitude, origin.latitude],
            [storeLocation.longitude, storeLocation.latitude]
          ]
        })
      }
    );

    if (!distanceResponse.ok) {
      console.error('OpenRouteService API error:', await distanceResponse.text());
      return 'Distance unavailable';
    }

    const distanceData = await distanceResponse.json();
    console.log('Distance calculation results:', distanceData);

    if (!distanceData.routes || distanceData.routes.length === 0) {
      return 'Distance unavailable';
    }

    const distance = distanceData.routes[0].summary.distance / 1000; // Convert meters to kilometers
    console.log('Final distance:', distance, 'km');
    
    return formatDistance(distance);
  } catch (error) {
    console.error('Error calculating distance:', error);
    return 'Distance unavailable';
  }
};

const formatDistance = (distance: number): string => {
  if (distance < 1) {
    return `${Math.round(distance * 1000)}m`;
  } else {
    return `${distance.toFixed(1)}km`;
  }
};
