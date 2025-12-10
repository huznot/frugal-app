// storeDistance.js
import axios from 'axios';
import haversine from 'haversine';
import * as Location from 'expo-location';

export const getCurrentLocation = async () => {
    try {
        // Request location permissions
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            throw new Error('Location permission not granted');
        }

        // Get the user's current location
        const location = await Location.getCurrentPositionAsync({});
        return {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
        };
    } catch (error) {
        console.error('Error getting location:', error.message);
        throw new Error('Unable to fetch current location');
    }
};

export const calculateDistance = async (origin, storeName, city) => {
    console.log(`City passed to findNearestStore: ${city}`);

    try {
        const response = await axios.get(`https://nominatim.openstreetmap.org/search?q=${storeName},${city}&format=json&addressdetails=1&limit=10`);
        const locations = response.data;

        if (!locations.length) {
            return "N/A";
        }

        let minDistance = Infinity;
        locations.forEach(loc => {
            const storeLocation = {
                latitude: parseFloat(loc.lat),
                longitude: parseFloat(loc.lon)
            };
            const distance = haversine(origin, storeLocation, { unit: 'km' });
            minDistance = Math.min(minDistance, distance);
        });

        return `${minDistance.toFixed(1)} km`;
    } catch (error) {
        return `Error finding store: ${error.message}`;
    }
};

export const findNearestStore = async (storeName, city) => {
    try {
        const origin = await getCurrentLocation();
        // Pass city to calculateDistance
        return await calculateDistance(origin, storeName, city);
    } catch (error) {
        return `Error finding store: ${error.message}`;
    }
};