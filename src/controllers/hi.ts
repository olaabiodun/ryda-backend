import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Dimensions, Animated, TextInput, ScrollView, FlatList, PanResponder, KeyboardAvoidingView, Platform, ActivityIndicator, Linking, LayoutAnimation, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import MapLayer from '../components/MapLayer';
import SearchingOverlay from '../components/SearchingOverlay';
import SideMenu from '../components/SideMenu';
import DriverCard from '../components/DriverCard';
import SOSButton from '../components/SOSButton';
import TripRatingModal from '../components/TripRatingModal';
import ActiveTripPanel from '../components/ActiveTripPanel';
import BookingPanel from '../components/BookingPanel';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { Ionicons, FontAwesome5, MaterialCommunityIcons, Feather, AntDesign } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTrip } from '../hooks/useTrip';
import { showToast, ToastContainer } from '../components/Toast';
import { searchPlaces, fetchNearbyPlaces, reverseGeocode, SearchResult, Place } from '../hooks/usePlaces';
import api from '../services/api';
import { StatusBar } from 'expo-status-bar';
import { calculateAllFares, formatNaira, RideTypeId } from '../utils/fareEngine';


const { height, width } = Dimensions.get('window');

const RIDES = [
  { id: 'lite', label: 'Eco Lite', iconType: 'Ion', icon: 'leaf-outline', seats: 4, eta: '~5 min', badge: 'CHEAPEST', badgeColor: '#10b981', carbon: '−0.8 kg CO₂', base: 800, dist: 100, disc: 150 },
  { id: 'eco', label: 'Fast', iconType: 'Fa5', icon: 'bolt', seats: 4, eta: '~2 min', badge: 'FASTEST', badgeColor: '#3b82f6', carbon: '−0.3 kg CO₂', base: 1200, dist: 150, disc: 50 },
  { id: 'pool', label: 'Pool', iconType: 'Ion', icon: 'people-outline', seats: 2, eta: '~6 min', badge: 'POPULAR', badgeColor: '#facc15', carbon: '−1.2 kg CO₂', base: 1000, dist: 120, disc: 200 },
  { id: 'premium', label: 'Premium', iconType: 'Ion', icon: 'car-sport-outline', seats: 4, eta: '~3 min', badge: 'LUXURY', badgeColor: '#8b5cf6', carbon: '−0.1 kg CO₂', base: 2500, dist: 250, disc: 0 },
  { id: 'xl', label: 'Ryda XL', iconType: 'Ion', icon: 'bus-outline', seats: 6, eta: '~7 min', badge: '6 SEATS', badgeColor: '#f59e0b', carbon: '−0.2 kg CO₂', base: 3500, dist: 350, disc: 0 },
  { id: 'business', label: 'Business', iconType: 'Ion', icon: 'briefcase-outline', seats: 4, eta: '~4 min', badge: 'VIP', badgeColor: '#111827', carbon: '−0.1 kg CO₂', base: 4500, dist: 500, disc: 0 },
];

const PAYMENTS = [
  { id: 'wallet', label: 'EcoWallet', icon: 'wallet-outline' },
  { id: 'cash', label: 'Cash Payment', icon: 'cash-outline' },
  { id: 'card', label: 'Eco Card ·· 4291', icon: 'card-outline' },
  { id: 'apple', label: 'Apple Pay', icon: 'logo-apple' },
];

const SHORTCUTS: any[] = [];

export default function MainMapScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { user, refreshProfile } = useAuth();
  const { activeTrip, requestTrip, findingDriver, cancelTrip, confirmArrival, updateLocation, updateTripStatus, driverTelemetry } = useTrip();
  const prevActiveTrip = useRef(activeTrip);

  useEffect(() => {
    prevActiveTrip.current = activeTrip;
  }, [activeTrip]);

  // ── State ──
  const [destination, setDestination] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [shortcuts, setShortcuts] = useState<any[]>([]);
  const [selectedRide, setSelectedRide] = useState('eco');
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);
  const [paymentIdx, setPaymentIdx] = useState(0);
  const [silentRide, setSilentRide] = useState(false);
  const [petFriendly, setPetFriendly] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [step, setStep] = useState(1);
  const [activeTab, setActiveTab] = useState('home');
  const [currentCoord, setCurrentCoord] = useState<{ latitude: number, longitude: number } | null>(null);
  const [currentAddress, setCurrentAddress] = useState('Finding you...');
  const [userHeading, setUserHeading] = useState(0);
  const [destinationCoord, setDestinationCoord] = useState<{ latitude: number, longitude: number } | null>(null);
  const [routeDistance, setRouteDistance] = useState('3.2 km');
  const [routeEta, setRouteEta] = useState('~4 min');
  const [showRating, setShowRating] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isOriginFocused, setIsOriginFocused] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [originAddress, setOriginAddress] = useState('');
  const [originCoord, setOriginCoord] = useState<{ latitude: number, longitude: number } | null>(null);
  const [userConfirmedSeen, setUserConfirmedSeen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const searching = findingDriver;
  const isTripActive = activeTrip?.status === 'STARTED' || activeTrip?.status === 'COMPLETED';
  const driverAssigned = !!activeTrip?.driverId && (activeTrip?.status === 'ACCEPTED' || activeTrip?.status === 'ARRIVED');
  const tripStarted = activeTrip?.status === 'STARTED';

  // ── Map Ref ──
  const mapRef = useRef<any>(null);

  // ── Route Anim ──
  const routeAnim = useRef(new Animated.Value(0)).current;

  // ── Animations ──
  const panelAnim = useRef(new Animated.Value(height)).current;
  const panelOffset = useRef(0);
  const contentFade = useRef(new Animated.Value(1)).current;
  const contentSlide = useRef(new Animated.Value(0)).current;
  const menuAnim = useRef(new Animated.Value(-width * 0.8)).current;
  const menuFade = useRef(new Animated.Value(0)).current;
  const searchTimerRef = useRef<any>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // ── Pan Responder ──
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderGrant: () => {
        panelAnim.setOffset(panelOffset.current);
        panelAnim.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        const newY = panelOffset.current + gestureState.dy;
        if (newY < 0) {
          panelAnim.setValue(-panelOffset.current); // Prevent dragging higher than 0
        } else {
          panelAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        panelAnim.flattenOffset();
        panelOffset.current += gestureState.dy;
        if (panelOffset.current < 0) panelOffset.current = 0;

        const COLLAPSED_Y = height * 0.45; // Collapse point
        if (gestureState.vy > 0.5 || panelOffset.current > COLLAPSED_Y * 0.4) {
          panelOffset.current = COLLAPSED_Y;
        } else {
          panelOffset.current = 0;
        }

        Animated.spring(panelAnim, {
          toValue: panelOffset.current,
          tension: 50,
          friction: 9,
          useNativeDriver: true
        }).start();
      }
    })
  ).current;

  const toggleMenu = () => {
    if (menuOpen) {
      Animated.parallel([
        Animated.timing(menuAnim, { toValue: -width * 0.8, duration: 250, useNativeDriver: true }),
        Animated.timing(menuFade, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => setMenuOpen(false));
    } else {
      setMenuOpen(true);
      Animated.parallel([
        Animated.spring(menuAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
        Animated.timing(menuFade, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  };

  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });

  useEffect(() => {
    Animated.spring(panelAnim, { toValue: 0, tension: 20, friction: 8, useNativeDriver: true }).start();

    let headingSub: Location.LocationSubscription | null = null;
    let locationSub: Location.LocationSubscription | null = null;

    (async () => {
      try {
        // Short delay to allow navigation transition to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setCurrentAddress('Location access denied');
          return;
        }

        // Use Balanced accuracy for faster/more stable fixes in production
        let location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        const coords = { latitude: location.coords.latitude, longitude: location.coords.longitude };
        setCurrentCoord(coords);
        setOriginCoord(coords);

        // Reverse Geocode
        try {
          const displayAddr = await reverseGeocode(location.coords.latitude, location.coords.longitude);
          setCurrentAddress(displayAddr);
          setOriginAddress(displayAddr);
        } catch (geoErr) {
          console.warn('Geocode Error:', geoErr);
          setCurrentAddress('Current Location');
          setOriginAddress('Current Location');
        }

        // Watch Heading (wrap in its own try/catch as it can fail on some devices)
        try {
          headingSub = await Location.watchHeadingAsync((data) => {
            setUserHeading(data.trueHeading > 0 ? data.trueHeading : data.magHeading);
          });
        } catch (headErr) {
          console.warn('Heading Watch Error:', headErr);
        }

      } catch (err) {
        console.warn('Location Error:', err);
        setCurrentAddress('Unable to fetch location');
      }
    })();

    return () => {
      if (headingSub) headingSub.remove();
    };
  }, []);

  // ── Load saved shortcuts (Home/Work) from AsyncStorage ──
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('cached_shortcuts');
        if (saved) {
          const { data } = JSON.parse(saved);
          if (data?.length > 0) setShortcuts(data);
        }
      } catch (_) { }
    })();
  }, []);

  // ── Fetch unread notification count ──
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await api.get('/notifications');
        const unread = (res.data || []).some((n: any) => !n.isRead);
        setHasUnread(unread);
      } catch (_) { }
    })();
  }, [user]);

  useEffect(() => {
    if (!currentCoord) return;
    (async () => {
      try {
        const nearby = await fetchNearbyPlaces(currentCoord.latitude, currentCoord.longitude, 5000);
        if (nearby.length > 0) {
          const mapped = nearby.map(p => ({
            iconType: 'Ion',
            icon: p.icon,
            label: p.name,
            address: p.address,
            latitude: p.latitude,
            longitude: p.longitude,
            distanceKm: `${p.distanceKm ?? 0} km`,
            etaMin: `~${Math.ceil((p.distanceKm ?? 0) * 2.5)} min`
          }));
          const filtered = mapped.slice(0, 8);

          // Merge: keep saved shortcuts (Home/Work etc), append nearby
          setShortcuts(prev => {
            const savedLabels = prev.filter(s => !s.isPlaceholder && ['Home', 'Work', 'Office', 'Mall', 'Gym', 'Friend'].includes(s.label));
            const combined = [...savedLabels, ...filtered.filter(f => !savedLabels.some(s => s.label === f.label))];
            return combined;
          });
        }
      } catch (err) {
        console.warn('Shortcuts error:', err);
      }
    })();
  }, [currentCoord]);

  useEffect(() => {
    if (!activeTrip) {
      // Detect if trip was cancelled by driver/server
      if (prevActiveTrip.current && step > 1 && !searching && prevActiveTrip.current.status !== 'COMPLETED') {
        showToast('Trip cancelled by driver');
        setStep(1);
        setDestinationCoord(null);
      }
      return;
    }

    // Detect if trip was completed by driver
    if (activeTrip.status === 'COMPLETED' && prevActiveTrip.current?.status !== 'COMPLETED') {
      // Auto-trigger completion UI
      setStep(1);
      setDestinationCoord(null);
      setDestination('');
      setTimeout(() => {
        setShowRating(true);
        // clear from context after showing modal if needed, 
        // but for now we let TripProvider manage it or we can manually null it.
      }, 500);
    }
  }, [activeTrip]);

  useEffect(() => {
    // searching effects handled in SearchingOverlay component
  }, [searching]);

  // ── Search Logic ──
  const performSearch = async (text: string) => {
    const query = text.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const results = await searchPlaces(query, currentCoord?.latitude, currentCoord?.longitude);
    setSearchResults(results);
    setIsSearching(false);
  };

  const onSearchTextChange = (text: string) => {
    setDestination(text);
    if (!isSearchFocused) setIsSearchFocused(true);
    // Force panel to top when searching
    Animated.spring(panelAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }).start();

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => performSearch(text), 400);
  };

  const onOriginSearchTextChange = (text: string) => {
    setOriginAddress(text);
    if (!isSearchFocused) setIsSearchFocused(true);
    Animated.spring(panelAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }).start();

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => performSearch(text), 400);
  };

  const selectPlace = (place: SearchResult | any) => {
    if (isOriginFocused) {
      setOriginAddress(place.name || place.label);
      setOriginCoord({ latitude: place.latitude, longitude: place.longitude });
    } else {
      setDestination(place.name || place.label);
      setDestinationCoord({ latitude: place.latitude, longitude: place.longitude });
    }

    const lat = place.latitude;
    const lon = place.longitude;

    let distVal = place.distanceKm;
    const calcFrom = isOriginFocused ? currentCoord : (originCoord || currentCoord);
    if (!distVal && calcFrom) {
      const R = 6371;
      const dLat = ((lat - calcFrom.latitude) * Math.PI) / 180;
      const dLon = ((lon - calcFrom.longitude) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos((calcFrom.latitude * Math.PI) / 180) * Math.cos((lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      distVal = `${dist.toFixed(1)} km`;
    }

    setRouteDistance(distVal || 'Calculating...');
    setRouteEta(place.etaMin || `~${Math.ceil(parseFloat(distVal || '0') * 2.5) || 5} min`);
    setShowSuggestions(false);
  };

  // ── Fare engine ──────────────────────────────────────────────────────────
  // Parse distance and duration from route data
  const distNum  = parseFloat(routeDistance.replace(' km', '').replace(',', '.')) || 0;
  const etaNum   = parseFloat(routeEta.replace(/[^0-9.]/g, '')) || Math.max(1, distNum * 2.5);
  const promoFrac = promoApplied ? 0.10 : 0;

  // Calculate fares for all ride types at once
  const allFares = calculateAllFares(distNum, etaNum, promoFrac);

  const getFareResult = (rideId: string) => allFares[rideId as RideTypeId];
  const selectedFare  = getFareResult(selectedRide);
  const total         = selectedFare?.total ?? 0;
  const promoDiscount = selectedFare?.breakdown?.promoDiscount ?? 0;
  const ride = RIDES.find(r => r.id === selectedRide)!;

  // Map RIDES to include dynamic prices for Display
  const dynamicRides = RIDES.map(r => ({
    ...r,
    price: getFareResult(r.id)?.formatted ?? '₦—',
  }));

  const changeStep = (newStep: number) => {
    // 1. Prepare native layout engine to automatically animate container height
    LayoutAnimation.configureNext({
      duration: 350,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'spring', springDamping: 0.82 },
      delete: { type: 'easeOut', property: 'opacity' },
    });

    // 2. Ensure panel is scrolled back up to the top
    panelOffset.current = 0;
    Animated.spring(panelAnim, {
      toValue: 0,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();

    // 3. Map overlay animations
    if (newStep === 2 && currentCoord && destinationCoord) {
      routeAnim.setValue(0);
      Animated.timing(routeAnim, { toValue: 1, duration: 600, useNativeDriver: false }).start();
    } else if (newStep === 1 && currentCoord) {
      setDestinationCoord(null);
    }

    // 4. Smoothly swap inner content via localized slide/fade
    Animated.parallel([
      Animated.timing(contentFade, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(contentSlide, { toValue: 15, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setStep(newStep);
      
      contentSlide.setValue(-15);
      Animated.parallel([
        Animated.spring(contentSlide, { toValue: 0, tension: 70, friction: 9, useNativeDriver: true }),
        Animated.timing(contentFade, { toValue: 1, duration: 250, useNativeDriver: true })
      ]).start();
    });
  };


  const cancelSearch = () => {
    cancelTrip();
    showToast('Search cancelled');
  };

  const onSelectLocationOnMap = () => {
    showToast('Long press on map to pick location');
    setIsSearchFocused(false);
    setShowSuggestions(false);
    // Collapse panel to reveal map
    Animated.spring(panelAnim, { toValue: height * 0.45, tension: 40, friction: 8, useNativeDriver: true }).start();
    panelOffset.current = height * 0.45;
  };

  const handleAction = async () => {
    // If driver has arrived, confirm we've seen them/ready to go
    if (activeTrip?.status === 'ARRIVED') {
      try {
        await confirmArrival(activeTrip.id);
        showToast('Confirmation sent to driver');
        setUserConfirmedSeen(true);
      } catch (err) {
        showToast('Confirmation failed');
      }
      return;
    }

    if (step === 1) {
      if (!destination) { showToast('Enter a destination first'); return; }
      changeStep(2);
      return;
    }

    if (!user?.phone) {
      showToast('Please add your phone number before ordering');
      router.push('/auth?step=phone_update');
      return;
    }

    // Check Wallet Balance if selected
    if (PAYMENTS[paymentIdx].id === 'wallet') {
      const balance = user?.walletBalance || 0;
      if (balance < total) {
        showToast(`Insufficient balance (₦${balance.toLocaleString()}). Please Top Up.`);
        router.push('/wallet'); // Or whatever the wallet topup screen is
        return;
      }
    }

    try {
      const pickupCoord = originCoord || currentCoord;
      if (pickupCoord && destinationCoord) {
        await requestTrip(
          { latitude: pickupCoord.latitude, longitude: pickupCoord.longitude, address: originAddress || currentAddress },
          { latitude: destinationCoord.latitude, longitude: destinationCoord.longitude, address: destination },
          selectedRide,
          distNum,
          PAYMENTS[paymentIdx].id
        );
        showToast('Finding your ride...');
      }
    } catch (err) {
      showToast('Booking failed. Check backend.');
    }
  };

  const applyPromo = () => {
    if (promoApplied) { showToast('Promo already applied'); return; }
    if (promoCode.length >= 3) {
      setPromoApplied(true);
      showToast('Promo applied! 15% off 🎉');
    } else {
      showToast('Invalid promo code');
    }
  };

  const handleMapLongPress = async (coord: { latitude: number, longitude: number }) => {
    try {
      showToast('Location selected! 📍', 'info');
      const address = await reverseGeocode(coord.latitude, coord.longitude);
      if (isOriginFocused) {
        setOriginAddress(address);
        setOriginCoord(coord);
      } else {
        setDestination(address);
        setDestinationCoord(coord);
        // If we were on step 1, don't auto-switch as they might want to adjust 
        // or check prices first. Their action will be reflected in the Input.
      }
    } catch (err) {
      console.warn('LongPress reverse geocode failed', err);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style='light' />
      {/* ── Map Layer ── */}

      <MapLayer 
        mapRef={mapRef} 
        currentCoord={currentCoord} 
        destinationCoord={destinationCoord} 
        userHeading={userHeading} 
        onLocationUpdate={(coord, heading) => {
          if (!currentCoord || Math.abs(currentCoord.latitude - coord.latitude) > 0.0001) {
            setCurrentCoord(coord);
            updateLocation(coord.latitude, coord.longitude);
          }
          if (Math.abs(userHeading - heading) > 1) {
            setUserHeading(heading);
          }
        }}
        driverCoord={driverTelemetry ? { latitude: driverTelemetry.lat, longitude: driverTelemetry.lng } : null}
        driverHeading={driverTelemetry?.heading}
        onMapLongPress={handleMapLongPress}
      />

      {/* ── Top Bar ── */}
      <SafeAreaView style={styles.topBar}>
        <TouchableOpacity onPress={toggleMenu} style={[styles.roundBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name={"menu" as any} size={20} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.appBadge}>
          <Text style={styles.badgeText}>RYDA</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={[styles.roundBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => { setHasUnread(false); router.push('/notifications'); }}>
            <Feather name={"bell" as any} size={18} color={colors.text} />
            {hasUnread && <View style={styles.notifDot} />}
          </TouchableOpacity>
        </View>
      </SafeAreaView>


      {/* ── Trip Info Banner (visible above panel when route is shown) ── */}
      {step === 2 && destinationCoord && (
        <Animated.View style={[styles.tripBanner, { opacity: routeAnim, transform: [{ translateY: routeAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
          <View style={styles.tripBannerItem}>
            <Ionicons name="navigate" size={14} color="#00ff66" />
            <Text style={styles.tripBannerLabel}>ETA</Text>
            <Text style={styles.tripBannerVal}>{routeEta}</Text>
          </View>
          <View style={styles.tripBannerDivider} />
          <View style={styles.tripBannerItem}>
            <Ionicons name="map" size={14} color="#00ff66" />
            <Text style={styles.tripBannerLabel}>Distance</Text>
            <Text style={styles.tripBannerVal}>{routeDistance}</Text>
          </View>
          <View style={styles.tripBannerDivider} />
          <View style={styles.tripBannerItem}>
            <Ionicons name="car" size={14} color="#00ff66" />
            <Text style={styles.tripBannerLabel}>Type</Text>
            <Text style={styles.tripBannerVal}>{ride.label}</Text>
          </View>
        </Animated.View>
      )}

      {/* ── Booking Panel ── */}
      <BookingPanel
        panelAnim={panelAnim}
        contentFade={contentFade}
        contentSlide={contentSlide}
        step={step}
        driverFound={driverAssigned}
        searching={searching}
        user={user}
        currentAddress={currentAddress}
        origin={originAddress}
        onOriginTextChange={onOriginSearchTextChange}
        isOriginFocused={isOriginFocused}
        setIsOriginFocused={setIsOriginFocused}
        destination={destination}
        onSearchTextChange={onSearchTextChange}
        isSearchFocused={isSearchFocused}
        setIsSearchFocused={setIsSearchFocused}
        setShowSuggestions={setShowSuggestions}
        showSuggestions={showSuggestions}
        isSearching={isSearching}
        searchResults={searchResults}
        selectPlace={selectPlace}
        shortcuts={shortcuts}
        rides={dynamicRides}
        selectedRide={selectedRide}
        setSelectedRide={setSelectedRide}
        showToast={showToast}
        ride={ride}
        fareBreakdown={selectedFare?.breakdown}
        formatNaira={formatNaira}
        total={total}
        promoApplied={promoApplied}
        promoCode={promoCode}
        promoDiscount={promoDiscount}
        setPromoCode={setPromoCode}
        applyPromo={applyPromo}
        showSchedule={showSchedule}
        setShowSchedule={setShowSchedule}
        petFriendly={petFriendly}
        setPetFriendly={setPetFriendly}
        silentRide={silentRide}
        setSilentRide={setSilentRide}
        payments={PAYMENTS}
        paymentIdx={paymentIdx}
        cyclePayment={cyclePayment}
        handleAction={handleAction}
        changeStep={changeStep}
        panHandlers={panResponder.panHandlers}
        colors={colors}
        isDark={isDark}
        onSelectOnMap={onSelectLocationOnMap}
        tripStarted={tripStarted}
        onMessage={() => router.push({
          pathname: '/chat',
          params: {
            name: activeTrip?.driver ? `${activeTrip.driver.first_name} ${activeTrip.driver.last_name}` : 'Driver',
            phone: activeTrip?.driver?.phone || '08034567890',
            avatar: activeTrip?.driver?.avatar || '',
            tripId: activeTrip?.id,
            recipientId: activeTrip?.driverId
          }
        })}
        onCall={() => Linking.openURL(`tel:${activeTrip?.driver?.phone}`)}
        driver={activeTrip?.driver}
        pin={activeTrip?.pin}
        userConfirmedSeen={userConfirmedSeen}
        setUserConfirmedSeen={setUserConfirmedSeen}
        setShortcuts={setShortcuts}
        fetchShortcuts={async () => shortcuts}
      />


      <SideMenu
        menuOpen={menuOpen}
        menuFade={menuFade}
        menuAnim={menuAnim}
        toggleMenu={toggleMenu}
        showToast={showToast}
      />

      <SearchingOverlay searching={searching} onCancel={cancelSearch} />

      {/* ── SOS Button (visible during active trip) */}
      <SOSButton visible={tripStarted} />

      {/* ── Active Trip Panel ── */}
      <ActiveTripPanel
        visible={isTripActive}
        onEndTrip={() => {
          refreshProfile();
          cancelTrip();
          setDestinationCoord(null);
          setStep(1);
          setDestination('');
          setTimeout(() => {
            setShowRating(true);
            showToast('Wallet balance updated');
          }, 600);
        }}
        totalDistance={parseFloat(routeDistance)}
        eta={parseInt(routeEta.replace(/\D/g, '')) || 8}
        trip={activeTrip}
      />

      {/* ── Post-trip Rating Modal ── */}
      <TripRatingModal
        visible={showRating}
        onClose={() => setShowRating(false)}
        tripId={prevActiveTrip.current?.id}
        driverName={prevActiveTrip.current?.driver?.first_name}
        driverAvatar={prevActiveTrip.current?.driver?.avatar}
        tripDistance={routeDistance}
        tripFare={formatNaira(total)}
      />

    </View>
  );

  function cyclePayment() {
    setPaymentIdx((prev) => (prev + 1) % PAYMENTS.length);
    showToast(`Payment: ${PAYMENTS[(paymentIdx + 1) % PAYMENTS.length].label}`);
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  map: { width: '100%', height: '100%' },

  // Marker
  userMarker: { alignItems: 'center', justifyContent: 'center' },
  pulseCircle: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(0,255,102,0.25)', position: 'absolute' },
  userDotShadow: { width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', shadowColor: '#00ff66', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6 },
  innerMarker: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#00ff66', borderWidth: 2, borderColor: '#fff' },

  // Destination Pin (teardrop shape)
  destPin: { alignItems: 'center' },
  destPinHead: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#111', borderWidth: 3, borderColor: '#00ff66', alignItems: 'center', justifyContent: 'center', shadowColor: '#00ff66', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8 },
  destPinInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00ff66' },
  destPinTail: { width: 3, height: 10, backgroundColor: '#00ff66', borderBottomLeftRadius: 3, borderBottomRightRadius: 3, marginTop: -1 },

  // Trip Banner
  tripBanner: { position: 'absolute', top: 100, alignSelf: 'center', flexDirection: 'row', backgroundColor: 'rgba(17,17,17,0.92)', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(0,255,102,0.2)', gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10 },
  tripBannerItem: { alignItems: 'center', paddingHorizontal: 10, gap: 2 },
  tripBannerLabel: { fontFamily: 'DMSans_400Regular', fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
  tripBannerVal: { fontFamily: 'DMSans_700Bold', fontSize: 14, color: '#fff' },
  tripBannerDivider: { width: 1, backgroundColor: '#333', marginVertical: 4 },

  // Top Bar
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
  roundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: 'white', fontSize: 18 },
  appBadge: {
    paddingHorizontal: 10
    , paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(26,26,26,0.8)', borderWidth: 1, borderColor: '#4ade80'
  },
  badgeText: { color: '#4ade80', fontFamily: 'DMSans_700Bold', fontSize: 12, letterSpacing: 2 },

  // Toast
  toast: { position: 'absolute', bottom: 110, alignSelf: 'center', backgroundColor: '#1a1a1a', borderRadius: 50, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: '#4ade80' },
  toastText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: '#4ade80' },

  // Side Menu
  menuOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sideMenu: { position: 'absolute', top: 0, left: 0, bottom: 0, width: width * 0.75, backgroundColor: '#111', borderRightWidth: 1, borderRightColor: '#222', shadowColor: '#000', shadowOffset: { width: 5, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20 },
  menuHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingTop: 20, paddingBottom: 30, borderBottomWidth: 1, borderBottomColor: '#222', gap: 16 },
  menuAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#4ade80', alignItems: 'center', justifyContent: 'center' },
  menuAvatarEmoji: { fontSize: 28 },
  menuName: { fontFamily: 'DMSans_700Bold', fontSize: 18, color: '#fff' },
  menuRating: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: '#aaa', marginTop: 4 },
  menuLinks: { flex: 1, paddingTop: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 24, gap: 16 },
  menuItemText: { fontFamily: 'DMSans_500Medium', fontSize: 16, color: '#ddd' },
  notifDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4ade80',
    borderWidth: 1.5,
    borderColor: '#000',
  },
  menuFooter: { paddingVertical: 5, paddingHorizontal: 24, borderTopWidth: 1, borderTopColor: '#222' },

  // Searching Overlay
  searchingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10, 10, 10, 0.95)', zIndex: 100 },
  searchingSafe: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 60 },
  radarContainer: { alignItems: 'center', justifyContent: 'center', marginTop: height * 0.15 },
  radarCircle: { position: 'absolute', width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(74, 222, 128, 0.2)', borderWidth: 1, borderColor: '#4ade80' },
  searchCarBox: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#161616', alignItems: 'center', justifyContent: 'center', elevation: 10, shadowColor: '#00ff66', shadowOpacity: 0.3, shadowRadius: 20 },
  searchTexts: { alignItems: 'center', marginTop: -40 },
  searchingTitle: { fontFamily: 'DMSans_700Bold', fontSize: 22, color: '#fff', marginBottom: 8 },
  searchingSub: { fontFamily: 'DMSans_400Regular', fontSize: 14, color: '#aaa', textAlign: 'center', paddingHorizontal: 40 },
  cancelSearchBtn: { width: '85%', paddingVertical: 18, borderRadius: 30, backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  cancelSearchText: { fontFamily: 'DMSans_700Bold', fontSize: 16, color: '#f87171' },

  // Driver Card
  driverContainer: { paddingHorizontal: 20 },
  driverCard: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#222' },
  driverProfileRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  driverAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  driverAvatarEmoji: { fontSize: 28 },
  driverInfo: { flex: 1 },
  driverName: { fontFamily: 'DMSans_700Bold', fontSize: 18, color: '#fff' },
  driverRatingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  driverRatingText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: '#ccc', marginLeft: 4 },
  driverCarInfo: { alignItems: 'flex-end' },
  driverCarName: { fontFamily: 'DMSans_700Bold', fontSize: 15, color: '#fff' },
  driverCarPlate: { fontFamily: 'DMSans_400Regular', fontSize: 12, color: '#aaa', marginTop: 2 },
  driverActionsRow: { flexDirection: 'row', gap: 12 },
  driverMessageBtn: { flex: 1, backgroundColor: '#2a2a2a', borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  driverMessageText: { fontFamily: 'DMSans_700Bold', color: '#fff', fontSize: 15 },
  driverCallBtn: { flex: 1, backgroundColor: '#4ade80', borderRadius: 12, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  driverCallText: { fontFamily: 'DMSans_700Bold', color: '#052e16', fontSize: 15 },
  safetyRow: { marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  safetyText: { fontFamily: 'DMSans_500Medium', fontSize: 13, color: '#aaa' },
});