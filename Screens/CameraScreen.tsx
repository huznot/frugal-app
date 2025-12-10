import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Modal,
  Pressable,
  Linking,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProductResult, searchProducts } from '../services/cameraSearch';
import { getUpcFromImage, lookupProductInfo, processImage as processImageFromService, ProcessImageResult } from '../services/cameraDisplay';
import { findNearestStore } from '../services/storeDistance'; // Import the function
import { useRoute } from '@react-navigation/native';

type Props = {
  navigation: NativeStackNavigationProp<any>;
};

export default function CameraScreen({ navigation }: Props) {
  const route = useRoute();
  const { city } = route.params || {}; // Retrieve city from navigation params
  console.log(`City in CameraScreen: ${city}`); // Debug log

  const [facing, setFacing] = useState<CameraType>('back');
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductResult[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductResult | null>(null);
  const cameraRef = useRef<any>(null);
  const [showResults, setShowResults] = useState(false);
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);

  if (!permission) {
    return (
      <View style={styles.container}>
        <Text>Loading camera permissions...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.text}>We need your permission to show the camera</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  const processImage = async (imagePath: string) => {
    try {
      setLoading(true);
      setError(null);
      setProducts([]);

      const upc = await getUpcFromImage(imagePath);

      if (!upc) {
        setError('Could not detect a barcode in the image. Please try again with a clearer image.');
        return;
      }

      const productInfo = await lookupProductInfo(upc);

      if (!productInfo || !productInfo.storeResults || productInfo.storeResults.length === 0) {
        setError('No product information found for this barcode.');
        return;
      }

      // Fetch distances for each product
      const productsWithDistances = await Promise.all(
        productInfo.storeResults.map(async (product) => {
          try {
            const cleanedSeller = product.seller.trim(); // Clean the seller name if needed
            const distance = await findNearestStore(cleanedSeller, city); // Pass city here
            return { ...product, distance };
          } catch {
            return { ...product, distance: 'N/A' };
          }
        })
      );

      setProducts(productsWithDistances);
    } catch (error) {
      console.error('Error processing image:', error);
      setError('Failed to process image. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  const cleanStoreName = (storeName: string): string => {
  // Remove unwanted prefixes or suffixes
  return storeName
    .replace(/^voila by\s*/i, '') // Remove "voila by" at the start
    .replace(/\.ca$/i, '') // Remove ".ca" at the end
    .replace(/^doordash -\s*/i, '') // Remove "doordash - " at the start
    .trim(); // Trim any extra spaces
};


  const takePicture = async () => {
    if (!cameraReady) return;

    try {
      setLoading(true);
      setError(null);
      setProducts([]);
      setShowResults(true);

      const photo = await cameraRef.current.takePictureAsync();

      if (!photo?.uri) {
        setError('Failed to capture image.');
        return;
      }

      setCapturedPhotoUri(photo.uri);

      const processResult = await processImageFromService(photo.uri);

      if (!processResult || !processResult.storeResults || processResult.storeResults.length === 0) {
        setError('No product information found for this image. Please try again with a clearer image.');
        return;
      }

      // Fetch distances for each product
      const productsWithDistances = await Promise.all(
        processResult.storeResults.map(async (product) => {
          try {
            const cleanedSeller = cleanStoreName(product.seller); // Clean the store name
            console.log(`Calling findNearestStore with city: ${city}`); // Debug log
            const distance = await findNearestStore(cleanedSeller, city); // Pass city here
            return { ...product, distance };
          } catch {
            return { ...product, distance: 'N/A' };
          }
        })
      );

      setProducts(productsWithDistances);
    } catch (error) {
      console.error('Error taking picture:', error);
      setError('Failed to take picture. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openMapsSearch = (seller: string) => {
    const query = encodeURIComponent(seller);
    const url = `geo:0,0?q=${query}`;
    Linking.openURL(url).catch((err) => console.error('Failed to open Maps app:', err));
  };

  const openWebsite = (productLink: string) => {
    if (!productLink) {
      console.error('No product link available');
      return;
    }
    Linking.openURL(productLink).catch((err) => console.error('Failed to open product link:', err));
  };

  const renderProduct = ({ item }: { item: ProductResult }) => {
    const handlePress = () => {
      setSelectedProduct(item);
      setModalVisible(true);
    };

    return (
      <TouchableOpacity onPress={handlePress} activeOpacity={0.8}>
        <View style={styles.productCard}>
          {item.thumbnail && (
            <Image source={{ uri: item.thumbnail }} style={styles.storeIcon} resizeMode="contain" />
          )}
          <View style={styles.productInfo}>
            <Text style={styles.productName} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.storeInfo}>{item.seller}</Text>
            <View style={styles.bottomRow}>
              <Text style={styles.rating}>
                {item.rating ? `Rating ${item.rating}` : 'No rating'}
              </Text>
              <Text style={styles.price}>{item.price}</Text>
            </View>
          </View>
          <Text style={styles.distanceText}>
            {typeof item.distance === 'string' ? item.distance : String(item.distance ?? 'N/A')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

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
            <TouchableOpacity style={styles.flipButton} onPress={toggleCameraFacing}>
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

      {(loading || products.length > 0 || error) && showResults && (
        <View style={styles.resultsContainer}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsHeaderText}>Available in stores:</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => {
                setShowResults(false);
                setCapturedPhotoUri(null);
              }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {capturedPhotoUri && (
            <Image
              source={{ uri: capturedPhotoUri }}
              style={styles.capturedImage}
              resizeMode="contain"
            />
          )}

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

      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.overlayPressable} onPress={() => setModalVisible(false)} />
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{selectedProduct?.title}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                openMapsSearch(selectedProduct?.seller || '');
                setModalVisible(false);
              }}
            >
              <Text style={styles.modalButtonText}>Open in Maps</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                openWebsite(selectedProduct?.product_link || '');
                setModalVisible(false);
              }}
            >
              <Text style={styles.modalButtonText}>Open Website</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  distanceText: {
    position: 'absolute', // Position at the top-right
    top: 8,
    right: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
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
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f8f9fa',
    padding: 16,
    zIndex: 1000,
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
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    position: 'relative', // Necessary for absolute positioning
    minHeight: 120, // Ensure enough space for content
  },
  storeIcon: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  productInfo: {
    flex: 1,
    justifyContent: 'space-between', // Distribute content vertically
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    maxWidth: '80%',
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
    marginTop: 4,
  },
  rating: {
    fontSize: 14,
    color: '#666',
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff4444',
    position: 'absolute', // Position at the bottom-right
    bottom: 8,
    right: 8,
  },
  capturedImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#eee',
    marginBottom: 16,
    borderRadius: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  overlayPressable: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  modalButton: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    color: 'black',
    fontSize: 16,
    fontWeight: '600',
  },
});