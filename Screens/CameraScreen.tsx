import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, FlatList, Image, ActivityIndicator } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProductResult, searchProducts } from '../services/cameraSearch';
import { getUpcFromImage, lookupProductInfo, processImage as processImageFromService, ProcessImageResult } from '../services/cameraDisplay';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

export default function CameraScreen({ navigation }: Props) {
  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductResult[]>([]);
  const cameraRef = useRef<any>(null);
  const [showResults, setShowResults] = useState(false);

  if (!permission) {
    // Camera permissions are still loading
    return (
      <View style={styles.container}>
        <Text>Loading camera permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet
    return (
      <View style={styles.container}>
        <Text style={styles.text}>We need your permission to show the camera</Text>
        <TouchableOpacity 
          style={styles.button} 
          onPress={requestPermission}
        >
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const toggleCameraFacing = () => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  };

  const processImage = async (imagePath: string) => {
    try {
      setLoading(true);
      setError(null);
      setProducts([]);
      
      // Extract UPC from the image
      const upc = await getUpcFromImage(imagePath);
      
      if (!upc) {
        setError('Could not detect a barcode in the image. Please try again with a clearer image.');
        return;
      }
      
      // Look up product information using the UPC
      const productInfo = await lookupProductInfo(upc);
      
      if (!productInfo || !productInfo.storeResults || productInfo.storeResults.length === 0) {
        setError('No product information found for this barcode.');
        return;
      }
      
      // Set the products state with the results
      setProducts(productInfo.storeResults);
    } catch (error) {
      console.error('Error processing image:', error);
      setError('Failed to process image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const takePicture = async () => {
    if (!cameraReady) return;
    
    try {
      setLoading(true);
      setError(null);
      setProducts([]);
      setShowResults(true);
      
      // Take a picture with the camera
      const photo = await cameraRef.current.takePictureAsync();
      
      if (!photo?.uri) {
        setError('Failed to capture image.');
        return;
      }
      
      // Process the image and get the results
      const processResult = await processImageFromService(photo.uri);
      
      if (!processResult) {
        setError('Failed to process image or find product information.');
        return;
      }
      
      // Set the products state with the store results
      setProducts(processResult.storeResults);
      
    } catch (error) {
      console.error('Error taking picture:', error);
      setError('Failed to take picture. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderProduct = ({ item }: { item: ProductResult }) => (
    <View style={styles.productCard}>
      {item.thumbnail && (
        <Image 
          source={{ uri: item.thumbnail }} 
          style={styles.storeIcon}
          resizeMode="contain"
        />
      )}
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.storeInfo}>{item.seller}</Text>
        <View style={styles.bottomRow}>
          <Text style={styles.rating}>
            {item.rating ? `Rating ${item.rating}` : 'No rating'}
          </Text>
          <Text style={styles.price}>{item.price}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        onCameraReady={() => setCameraReady(true)}
        onMountError={(error) => {
          console.error('Camera mount error:', error);
        }}
      >
        <View style={styles.overlay}>
          <View style={styles.controls}>
            <TouchableOpacity 
              style={styles.flipButton} 
              onPress={toggleCameraFacing}
            >
              <Text style={styles.text}>Flip Camera</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.captureButton}
              onPress={takePicture}
              disabled={!cameraReady || loading}
            >
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>

      {/* Results Section */}
      {(loading || products.length > 0 || error) && showResults && (
        <View style={styles.resultsContainer}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsHeaderText}>Available in stores:</Text>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setShowResults(false)}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
          
          {loading && (
            <View style={styles.centerContainer}>
              <ActivityIndicator size={36} color="#ff4444" />
              <Text style={styles.loadingText}>Processing image...</Text>
            </View>
          )}

          {error && (
            <View style={styles.centerContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {products.length > 0 && !loading && !error && (
            <FlatList
              data={products}
              renderItem={renderProduct}
              keyExtractor={(item, index) => index.toString()}
              contentContainerStyle={styles.productList}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 30,
    width: '100%',
  },
  text: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 8,
    marginTop: 20,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  flipButton: {
    padding: 15,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'white',
  },
  resultsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#f8f9fa',
    maxHeight: '50%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#666',
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: '#ff4444',
    textAlign: 'center',
    fontSize: 16,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  resultsHeaderText: {
    color: '#333',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  closeButtonText: {
    fontSize: 18,
    color: '#666',
    fontWeight: 'bold',
  },
  productList: {
    paddingVertical: 8,
  },
  productCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  storeIcon: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    color: '#333',
  },
  storeInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rating: {
    fontSize: 14,
    color: '#666',
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff4444',
  },
});