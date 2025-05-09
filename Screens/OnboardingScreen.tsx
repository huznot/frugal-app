import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Image, Dimensions, TextInput, Alert } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { useCameraPermissions } from 'expo-camera'; // Use the hook for camera permissions

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

const { width } = Dimensions.get('window');

const slides = [
  {
    id: 1,
    title: 'Welcome to Frugal',
    description: 'Scan a product to find the best deals on your favorite products',
    image: require('../assets/barcode-scan.png'),
  },
  {
    id: 2,
    title: 'Camera Access',
    description: 'We need camera permission to scan an item and help you save money',
    image: require('../assets/camera-permission.png'),
  },
  {
    id: 3,
    title: 'Location Access',
    description: 'We need your location to show you the closest stores and best deals near you',
    image: require('../assets/location-permission.png'),
    hasInput: true,
  },
  {
    id: 4,
    title: "Let's Get Started",
    description: 'Start scanning and saving today!',
    image: require('../assets/savings.png'),
  },
];

export default function OnboardingScreen({ navigation }: Props) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [city, setCity] = useState('');
  const [isInputValid, setIsInputValid] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions(); // Use the hook

  const handleNext = async () => {
    if (currentSlide === 1) {
      // Request camera permissions on slide ID 2
      if (!cameraPermission?.granted) {
        const { granted } = await requestCameraPermission();
        if (!granted) {
          Alert.alert('Permission Denied', 'Camera permission is required to scan items.');
          return;
        }
      }
    }

    if (currentSlide === 2) {
      // Request location permissions on slide ID 3
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to find nearby stores.');
        return;
      }
    }

    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      // Pass city directly to MainTabs
      navigation.navigate('MainTabs', { city });
    }
  };

  const handleInputChange = (text: string) => {
    setCity(text);
    setIsInputValid(text.trim().length > 0); // Validate input
  };

  return (
    <View style={styles.container}>
      <View style={styles.slideContainer}>
        <Image source={slides[currentSlide].image} style={styles.image} />
        <Text style={styles.title}>{slides[currentSlide].title}</Text>
        <Text style={styles.description}>{slides[currentSlide].description}</Text>

        {slides[currentSlide].hasInput && (
          <TextInput
            style={styles.input}
            placeholder="Enter your city"
            value={city}
            onChangeText={handleInputChange}
          />
        )}
      </View>

      <View style={styles.pagination}>
        {slides.map((_, index) => (
          <View
            key={index}
            style={[
              styles.paginationDot,
              index === currentSlide && styles.paginationDotActive,
            ]}
          />
        ))}
      </View>

      <TouchableOpacity
        style={[
          styles.button,
          slides[currentSlide].hasInput && !isInputValid && styles.buttonDisabled,
        ]}
        onPress={handleNext}
        disabled={slides[currentSlide].hasInput && !isInputValid} // Disable button if input is invalid
      >
        <Text style={styles.buttonText}>
          {currentSlide === slides.length - 1 ? 'Get Started' : 'Next'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 60,
  },
  slideContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: width - 40,
  },
  image: {
    width: width * 0.7,
    height: width * 0.7,
    marginBottom: 40,
    resizeMode: 'contain',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    paddingHorizontal: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    width: '80%',
    marginTop: 20,
    textAlign: 'center',
  },
  pagination: {
    flexDirection: 'row',
    marginBottom: 40,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ccc',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: '#ff4444',
    width: 20,
  },
  button: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 100,
    paddingVertical: 15,
    borderRadius: 25,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});