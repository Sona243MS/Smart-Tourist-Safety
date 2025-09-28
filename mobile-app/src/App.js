import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useGeolocated } from "react-geolocated";
import logo from "./assets/logo.svg";
import QRCode from "react-qr-code";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Tooltip,
  useMediaQuery,
  Fab,
  Badge,
  Switch,
  FormControlLabel
} from "@mui/material";
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Security as SecurityIcon,
  LocationOn as LocationIcon,
  Phone as PhoneIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  BatteryAlert as BatteryAlertIcon,
  Share as ShareIcon,
  QrCode as QrCodeIcon,
  Person as PersonIcon,
  DeviceHub as DeviceIcon,
  Language as LanguageIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon
} from "@mui/icons-material";
// Configure API base URL for production deployments (Firebase/Netlify, etc.)
if (process.env.REACT_APP_API_BASE) {
  axios.defaults.baseURL = process.env.REACT_APP_API_BASE;
}
// Attach DID token automatically if present
axios.interceptors.request.use((config) => {
  try {
    const tok = localStorage.getItem('did.token');
    if (tok) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${tok}`;
    }
  } catch {}
  return config;
});

function App() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [touristId, setTouristId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [bleAddress, setBleAddress] = useState("");
  const [backendStatus, setBackendStatus] = useState("checking"); // checking | online | offline
  const [lastSentAt, setLastSentAt] = useState(null);
  const [geofences, setGeofences] = useState([]);
  const [regions, setRegions] = useState([]);
  const [currentRegion, setCurrentRegion] = useState('default');
  const [currentRisk, setCurrentRisk] = useState(null);
  const [mobileScore, setMobileScore] = useState(null);
  const [lang, setLang] = useState('en'); // 'en' | 'as'
  const [dark, setDark] = useState(false);
  const [track, setTrack] = useState(false);
  const [lastGpsAt, setLastGpsAt] = useState(null);
  // DID state
  const [didToken, setDidToken] = useState("");
  const [kycType, setKycType] = useState('passport');
  const [kycNumber, setKycNumber] = useState('');
  const [tripDays, setTripDays] = useState(14);
  const [itinerary, setItinerary] = useState('');
  const [emergencyContacts, setEmergencyContacts] = useState('');
  // UI state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [alerts, setAlerts] = useState([]);
  
  // Responsive breakpoint
  const isMobile = useMediaQuery('(max-width:600px)');
  
  // MUI Theme
  const theme = createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
      primary: {
        main: '#dc2626', // red-600
      },
      secondary: {
        main: '#1f2937', // gray-800
      },
    },
    components: {
      MuiDrawer: {
        styleOverrides: {
          paper: {
            width: isMobile ? '100%' : 280,
          },
        },
      },
    },
  });

  // Geolocation hook
  const { coords, isGeolocationAvailable, isGeolocationEnabled } =
    useGeolocated({
      positionOptions: {
        enableHighAccuracy: true,
      },
      watchPosition: false,
      userDecisionTimeout: 5000,
    });

  const checkBackend = async () => {
    try {
      await axios.get("/panic-alerts", { timeout: 5000 });
      setBackendStatus("online");
    } catch (e) {
      setBackendStatus("offline");
    }
  };

  const sendGpsPing = async () => {
    if (!coords) return;
    try {
      await axios.post('/gps/update', {
        latitude: coords.latitude,
        longitude: coords.longitude,
        touristId: touristId || null,
        deviceId: deviceId || null,
      });
      setLastGpsAt(new Date().toISOString());
    } catch (e) {
      // ignore
    }
  };

  const verifyDid = async () => {
    try {
      if (!didToken) { setMessage('⚠️ No active token'); return; }
      setLoading(true);
      const res = await axios.post('/did/verify', { token: didToken });
      if (res.data?.ok) {
        setMessage(`✅ Valid. Expires: ${new Date((res.data.claims.exp||0)*1000).toLocaleString()}`);
      } else {
        setMessage('❌ Invalid or expired ID');
      }
    } catch (e) {
      setMessage('❌ Failed to verify ID');
    } finally {
      setLoading(false);
      setTimeout(() => setMessage(''), 2500);
    }
  };

  const clearDid = () => {
    try { localStorage.removeItem('did.token'); } catch {}
    setDidToken('');
    setMessage('ℹ️ Digital ID cleared');
    setTimeout(() => setMessage(''), 2000);
  };

  // Utility: hash using Web Crypto
  async function sha256Hex(str) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
    const arr = Array.from(new Uint8Array(buf));
    return arr.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const issueDid = async () => {
    try {
      if (!kycNumber) { setMessage('⚠️ Enter KYC number'); return; }
      setLoading(true);
      const hash = await sha256Hex(`${kycType}:${kycNumber}`);
      const contactsArr = (emergencyContacts||'').split(',').map(s=>s.trim()).filter(Boolean);
      const body = { kycType, kycHash: hash, validDays: Number(tripDays) || 14, itinerary: itinerary || null, emergencyContacts: contactsArr.length ? contactsArr : null };
      const res = await axios.post('/did/issue', body);
      if (res.data?.didToken) {
        localStorage.setItem('did.token', res.data.didToken);
        setDidToken(res.data.didToken);
        setMessage(`✅ Digital ID issued. Expires: ${res.data.expiresAt}`);
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('❌ Failed to issue Digital ID');
      }
    } catch (e) {
      setMessage('❌ Failed to issue Digital ID');
    } finally {
      setLoading(false);
    }
  };

  // Region-based emergency contacts from backend
  const contacts = useMemo(() => {
    const region = (regions || []).find(r => r.id === currentRegion) || (regions || []).find(r => r.id === 'default');
    const list = region?.contacts || [];
    // Map backend contacts to bilingual labels
    return list.map(c => ({
      labelEn: c.label || c.name || 'Contact',
      labelAs: c.labelAs || c.label || 'যোগাযোগ',
      phone: c.phone || ''
    }));
  }, [regions, currentRegion]);

  const sendSoftAlert = async (type) => {
    if (!coords) {
      setMessage("⚠️ Location not available. Please allow location access.");
      return;
    }
    try {
      setLoading(true);
      await axios.post('/soft-alert', {
        latitude: coords.latitude,
        longitude: coords.longitude,
        touristId: touristId || null,
        deviceId: deviceId || null,
        type,
      });
      if (type === 'safe') setMessage('✅ Status sent: I\'m safe');
      else if (type === 'low_battery') setMessage('✅ Status sent: Low battery');
      else setMessage('✅ Status sent');
      setTimeout(() => setMessage(''), 2500);
    } catch (e) {
      setMessage('❌ Failed to send status');
    } finally {
      setLoading(false);
    }
  };

  const fetchGeofences = async () => {
    try {
      const res = await axios.get('/geofences');
      if (res.data?.ok && Array.isArray(res.data.geofences)) setGeofences(res.data.geofences);
    } catch (_) {}
  };
  const fetchRegions = async () => {
    try {
      const res = await axios.get('/regions');
      if (res.data?.ok && Array.isArray(res.data.regions)) setRegions(res.data.regions);
    } catch (_) {}
  };

  const fetchAlerts = async () => {
    try {
      const res = await axios.get('/panic-alerts');
      if (res.data?.ok && Array.isArray(res.data.alerts)) {
        setAlerts(res.data.alerts);
      }
    } catch (_) {
      // Mock data for demonstration
      setAlerts([
        {
          id: 1,
          type: 'panic',
          timestamp: new Date().toISOString(),
          status: 'sent',
          location: coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'Unknown',
          touristId: touristId || 'N/A'
        },
        {
          id: 2,
          type: 'safe',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          status: 'sent',
          location: coords ? `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}` : 'Unknown',
          touristId: touristId || 'N/A'
        }
      ]);
    }
  };

  // Load persisted IDs and start retry loop for queued alerts
  useEffect(() => {
    const t = localStorage.getItem("touristId");
    const d = localStorage.getItem("deviceId");
    const token = localStorage.getItem('did.token');
    if (t) setTouristId(t);
    if (d) setDeviceId(d);
    if (token) setDidToken(token);
    // Load mobile UI prefs
    try {
      const pDark = localStorage.getItem('mobile.dark');
      if (pDark != null) setDark(pDark === '1');
      const pLang = localStorage.getItem('mobile.lang');
      if (pLang) setLang(pLang);
    } catch {}
    const interval = setInterval(retryQueuedAlerts, 8000);
    const ping = setInterval(checkBackend, 15000);
    checkBackend();
    fetchGeofences();
    fetchRegions();
    fetchAlerts();
    return () => { clearInterval(interval); clearInterval(ping); };
  }, []);

  // Persist mobile UI prefs
  useEffect(() => {
    try { localStorage.setItem('mobile.dark', dark ? '1' : '0'); } catch {}
  }, [dark]);
  useEffect(() => {
    try { localStorage.setItem('mobile.lang', lang || 'en'); } catch {}
  }, [lang]);
  // Track GPS pings every 30s when enabled
  useEffect(() => {
    if (!track) return;
    const intv = setInterval(() => {
      sendGpsPing();
    }, 30000);
    // send immediately once when toggled on
    sendGpsPing();
    return () => clearInterval(intv);
  }, [track, coords, touristId, deviceId]);

  // Simple point-in-polygon
  function pointInPolygon(point, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    const [x, y] = [point[1], point[0]]; // lng, lat
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][1], yi = polygon[i][0];
      const xj = polygon[j][1], yj = polygon[j][0];
      const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Determine current zone + risk based on coords + geofences
  useEffect(() => {
    if (!coords || !geofences?.length) return;
    const lat = coords.latitude; const lng = coords.longitude;
    const match = geofences.find(f => pointInPolygon([lat, lng], f.polygon));
    if (match) {
      setCurrentRegion(match.regionId || 'default');
      setCurrentRisk(match.riskLevel || null);
    } else {
      setCurrentRegion('default');
      setCurrentRisk(null);
    }
  }, [coords, geofences]);

  // Fetch safety score for current region
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get('/safety-score', { params: { regionId: currentRegion || 'default' } });
        if (res.data?.ok) setMobileScore(res.data.score);
      } catch (_) {}
    })();
  }, [currentRegion]);

  // Labels for EN / Assamese (basic demo)
  const t = useMemo(() => {
    const en = {
      appTitle: 'Smart Tourist Safety',
      subtitle: 'Emergency SOS and Live Safety Status',
      safetyScore: 'Safety Score',
      currentZoneRisk: 'Current zone risk',
      outsideZone: 'Outside any risk zone',
      gps: 'GPS',
      backend: 'Backend',
      queuedAlerts: 'Queued Alerts',
      myId: 'My ID',
      showToResponders: 'Show this to responders to quickly identify and link your device.',
      touristId: 'Tourist ID',
      deviceId: 'Device ID',
      setup: 'Setup',
      registerTourist: 'Register Tourist',
      phone: 'Phone',
      pairDevice: 'Pair Device',
      bleOptional: 'BLE Address (optional)',
      panic: 'Panic Alert',
      tapToSend: 'Tap the button below to send an emergency SOS with your current location.',
      send: 'Send Panic Alert',
      lastSent: 'Last sent',
      contacts: 'Emergency Contacts',
      police: 'Police',
      ambulance: 'Ambulance',
      disaster: 'Disaster Response',
      shareLoc: 'Share Location',
      copyLink: 'Copy link',
      copied: 'Link copied!',
      language: 'Language',
      aadhaar: 'Aadhaar (12 digits, required)',
      aadhaarRequiredMsg: 'Aadhaar is required and must be 12 digits',
    };
    const as = {
      appTitle: 'স্মাৰ্ট পৰ্যটক সুৰক্ষা',
      subtitle: 'জৰুৰীকালীন SOS আৰু লাইভ সুৰক্ষা স্থিতি',
      safetyScore: 'সুৰক্ষা স্ক’ৰ',
      currentZoneRisk: 'বৰ্তমান অঞ্চল ঝুঁকি',
      outsideZone: 'কোনো অঞ্চলৰ বাহিৰে',
      gps: 'জিপিএছ',
      backend: 'বেকএণ্ড',
      queuedAlerts: 'পৰম্পৰা সতর্কবাণী',
      myId: 'মোৰ পৰিচয়',
      showToResponders: 'উদ্ধাৰকাৰীসকলক দেখুৱাওক যাতে সোনকালে চিনাক্ত কৰিব পাৰে।',
      touristId: 'পৰ্যটক ID',
      deviceId: 'ডিভাইচ ID',
      setup: 'ছেটআপ',
      registerTourist: 'পৰ্যটক রেজিষ্টাৰ',
      phone: 'ফোন',
      pairDevice: 'ডিভাইচ পেয়াৰ',
      bleOptional: 'BLE ঠিকনা (ঐচ্ছিক)',
      panic: 'জৰুৰী SOS',
      tapToSend: 'তলৰ বুটাম টিপি আপোনাৰ স্থানসহ SOS পঠিয়াওক।',
      send: 'SOS পঠিয়াওক',
      lastSent: 'সৰ্বশেষ পঠিওৱা',
      contacts: 'জৰুৰী যোগাযোগ',
      police: 'পুলিচ',
      ambulance: 'এম্বুলেঞ্চ',
      disaster: 'দুৰ্যোগ প্ৰতিক্ৰিয়া',
      shareLoc: 'স্থান শ্বেয়াৰ',
      copyLink: 'লিংক কপি',
      copied: 'লিংক কপি হ’ল!',
      language: 'ভাষা',
      aadhaar: 'আধাৰ (১২ সংখ্যা, আবশ্যক)',
      aadhaarRequiredMsg: 'আধাৰ ১২ সংখ্যাৰ হব লাগিব',
    };
    // Additional North-Eastern languages (basic labels; fallback to EN)
    const bn = {
      appTitle: 'স্মার্ট ট্যুরিস্ট সেফটি',
      subtitle: 'জরুরি SOS ও লাইভ সেফটি স্ট্যাটাস',
      safetyScore: 'সেফটি স্কোর',
      currentZoneRisk: 'বর্তমান এলাকার ঝুঁকি',
      outsideZone: 'কোনো ঝুঁকিপূর্ণ এলাকার বাইরে',
      gps: 'জিপিএস',
      backend: 'ব্যাকএন্ড',
      queuedAlerts: 'কিউড অ্যালার্ট',
      myId: 'আমার আইডি',
      showToResponders: 'রেসপন্ডারদের দেখান দ্রুত সনাক্তকরণের জন্য।',
      touristId: 'ট্যুরিস্ট আইডি',
      deviceId: 'ডিভাইস আইডি',
      setup: 'সেটআপ',
      registerTourist: 'ট্যুরিস্ট রেজিস্টার',
      phone: 'ফোন',
      pairDevice: 'ডিভাইস পেয়ার',
      bleOptional: 'BLE ঠিকানা (ঐচ্ছিক)',
      panic: 'জরুরি SOS',
      tapToSend: 'নিচের বাটনে চাপ দিয়ে আপনার অবস্থানসহ SOS পাঠান।',
      send: 'SOS পাঠান',
      lastSent: 'সর্বশেষ',
      contacts: 'জরুরি যোগাযোগ',
      police: 'পুলিশ',
      ambulance: 'অ্যাম্বুলেন্স',
      disaster: 'দুর্যোগ সেবা',
      shareLoc: 'লোকেশন শেয়ার',
      copyLink: 'লিংক কপি',
      copied: 'লিংক কপি হয়েছে!',
      language: 'ভাষা',
      aadhaar: 'আধার (১২ সংখ্যা, আবশ্যক)',
      aadhaarRequiredMsg: 'আধার ১২ সংখ্যার হতে হবে',
    };
    const brx = {
      appTitle: 'स्मार्ट टुरिस्ट सेफ्टी',
      subtitle: 'दावग्रो SOS आरो लाइव सेफ्टी स्टेटस',
      safetyScore: 'सेफ्टी स्कोर',
      currentZoneRisk: "दानि ज'ननि जोखि",
      outsideZone: "ज'ननि बाहाय",
      gps: 'GPS',
      backend: 'बेकएण्ड',
      queuedAlerts: 'क्यू अलार्म',
      myId: 'आंनि ID',
      showToResponders: 'सजललाई थाखायनाय जों सिगांलां जाबाय।',
      touristId: 'टुरिस्ट ID',
      deviceId: 'डिभाइस ID',
      setup: 'सेटअप',
      registerTourist: 'टुरिस्ट रेजिष्टर',
      phone: 'फोन',
      pairDevice: 'डिभाइस पेर',
      bleOptional: 'BLE थं (आवस्यक नङा)',
      panic: 'जोरजोरनि SOS',
      tapToSend: 'बुं दाब हो लाबाय',
      send: 'SOS लाबाय',
      lastSent: "ज'खाथि लाबाय",
      contacts: 'जोरजोरनि फोन',
      police: 'Police',
      ambulance: 'Ambulance',
      disaster: 'Disaster',
      shareLoc: 'Location शेयर',
      copyLink: 'लिंक कपी',
      copied: 'लिंक कपीखालाम! ',
      language: 'Language',
    };
    const mni = { ...en, appTitle: 'স্মার্ট পর্যটক সুরক্ষা (মণিপুরী)', subtitle: en.subtitle };
    const kha = { ...en, appTitle: 'Smart Tourist Safety (Khasi)', subtitle: en.subtitle };
    const grt = { ...en, appTitle: 'Smart Tourist Safety (Garo)', subtitle: en.subtitle };
    const lus = { ...en, appTitle: 'Smart Tourist Safety (Mizo)', subtitle: en.subtitle };

    const dict = { en, as, bn, brx, mni, kha, grt, lus };
    return dict[lang] || en;
  }, [lang]);

  const mapShareUrl = useMemo(() => {
    if (!coords) return '';
    // Google Maps share link
    return `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
  }, [coords]);

  const copyShareLink = async () => {
    if (!mapShareUrl) return;
    try {
      await navigator.clipboard.writeText(mapShareUrl);
      setMessage(`✅ ${t.copied}`);
      setTimeout(() => setMessage(''), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = mapShareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setMessage(`✅ ${t.copied}`);
      setTimeout(() => setMessage(''), 2000);
    }
  };

  const registerTourist = async () => {
    try {
      setLoading(true);
      // Aadhaar required: must be 12 digits
      const aadhaarTrim = (aadhaar || '').replace(/\s+/g, '');
      if (!/^\d{12}$/.test(aadhaarTrim)) {
        setMessage(`⚠️ ${t.aadhaarRequiredMsg || 'Aadhaar is required and must be 12 digits'}`);
        setTimeout(()=>setMessage(''), 2500);
        return;
      }
      const res = await axios.post("/tourists/register", { name, phone, aadhaar: aadhaarTrim || undefined });
      if (res.data?.ok && res.data.touristId) {
        setTouristId(res.data.touristId);
        localStorage.setItem("touristId", res.data.touristId);
        const last4 = aadhaarTrim ? aadhaarTrim.slice(-4) : '';
        setMessage(`✅ Tourist registered${last4 ? ' (Aadhaar ****' + last4 + ')' : ''}`);
      } else {
        setMessage("❌ Failed to register tourist");
      }
    } catch (e) {
      setMessage("❌ Failed to register tourist");
    } finally {
      setLoading(false);
    }
  };

  const pairDevice = async () => {
    try {
      setLoading(true);
      const res = await axios.post("/devices/pair", { touristId, bleAddress });
      if (res.data?.ok && res.data.deviceId) {
        setDeviceId(res.data.deviceId);
        localStorage.setItem("deviceId", res.data.deviceId);
        setMessage("✅ Device paired");
      } else {
        setMessage("❌ Failed to pair device");
      }
    } catch (e) {
      setMessage("❌ Failed to pair device");
    } finally {
      setLoading(false);
    }
  };

  const retryQueuedAlerts = async () => {
    const key = "panicQueue";
    const queued = JSON.parse(localStorage.getItem(key) || "[]");
    if (!queued.length) return;
    const remaining = [];
    for (const payload of queued) {
      try {
        await axios.post("/panic-alert", payload);
      } catch (e) {
        remaining.push(payload);
      }
    }
    if (remaining.length !== queued.length) {
      localStorage.setItem(key, JSON.stringify(remaining));
    }
  };

  const sendPanicAlert = async () => {
    if (!coords) {
      setMessage("⚠️ Location not available. Please allow location access.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const payload = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        touristId: touristId || null,
        deviceId: deviceId || null,
      };
      await axios.post("/panic-alert", payload);

      setMessage("🚨 Panic alert sent successfully!");
      setLastSentAt(new Date().toISOString());
    } catch (error) {
      console.error(error);
      // queue for retry
      const key = "panicQueue";
      const queued = JSON.parse(localStorage.getItem(key) || "[]");
      queued.push({
        latitude: coords.latitude,
        longitude: coords.longitude,
        touristId: touristId || null,
        deviceId: deviceId || null,
      });
      localStorage.setItem(key, JSON.stringify(queued));
      setMessage("❌ Failed to send panic alert. Will retry automatically.");
    } finally {
      setLoading(false);
    }
  };

  if (!isGeolocationAvailable) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box display="flex" alignItems="center" justifyContent="center" height="100vh" color="error.main">
          <Typography variant="h5" fontWeight="bold">
            Your browser does not support Geolocation.
          </Typography>
        </Box>
      </ThemeProvider>
    );
  }

  if (!isGeolocationEnabled) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box display="flex" alignItems="center" justifyContent="center" height="100vh" color="error.main">
          <Typography variant="h5" fontWeight="bold">
            Geolocation is not enabled. Please enable location access.
          </Typography>
        </Box>
      </ThemeProvider>
    );
  }

  const drawerItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { id: 'alerts', label: 'Alerts', icon: <NotificationsIcon /> },
    { id: 'security', label: 'Security', icon: <SecurityIcon /> },
    { id: 'location', label: 'Location', icon: <LocationIcon /> },
    { id: 'contacts', label: 'Contacts', icon: <PhoneIcon /> },
    { id: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  ];

  const renderAlertsTable = () => (
    <TableContainer component={Paper} sx={{ mt: 2 }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Type</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Location</TableCell>
            <TableCell>Timestamp</TableCell>
            <TableCell>Tourist ID</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {alerts.map((alert) => (
            <TableRow key={alert.id}>
              <TableCell>
                <Chip
                  icon={alert.type === 'panic' ? <WarningIcon /> : <CheckCircleIcon />}
                  label={alert.type}
                  color={alert.type === 'panic' ? 'error' : 'success'}
                  size="small"
                />
              </TableCell>
              <TableCell>
                <Chip
                  label={alert.status}
                  color={alert.status === 'sent' ? 'success' : 'warning'}
                  size="small"
                />
              </TableCell>
              <TableCell>{alert.location}</TableCell>
              <TableCell>{new Date(alert.timestamp).toLocaleString()}</TableCell>
              <TableCell>{alert.touristId}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        {/* App Bar */}
        <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
          <Toolbar>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setDrawerOpen(!drawerOpen)}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
            <img src={logo} alt="Smart Tourist Safety" style={{ width: 32, height: 32, marginRight: 16 }} />
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              {t.appTitle}
            </Typography>
            
            {/* Dashboard Toolbar with Icons and Tooltips */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Tooltip title="Toggle Dark Mode">
                <IconButton color="inherit" onClick={() => setDark(!dark)}>
                  {dark ? <LightModeIcon /> : <DarkModeIcon />}
                </IconButton>
              </Tooltip>
              
              <Tooltip title="Language Settings">
                <IconButton color="inherit">
                  <LanguageIcon />
                </IconButton>
              </Tooltip>
              
              <Tooltip title="Notifications">
                <IconButton color="inherit">
                  <Badge badgeContent={alerts.length} color="error">
                    <NotificationsIcon />
                  </Badge>
                </IconButton>
              </Tooltip>
              
              <Tooltip title="Share Location">
                <IconButton color="inherit" onClick={copyShareLink}>
                  <ShareIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Toolbar>
        </AppBar>

        {/* Drawer */}
        <Drawer
          variant={isMobile ? "temporary" : "persistent"}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          sx={{
            width: isMobile ? '100%' : 280,
            flexShrink: 0,
            '& .MuiDrawer-paper': {
              width: isMobile ? '100%' : 280,
              boxSizing: 'border-box',
            },
          }}
        >
          <Toolbar />
          <Box sx={{ overflow: 'auto' }}>
            <List>
              {drawerItems.map((item) => (
                <ListItem
                  button
                  key={item.id}
                  selected={currentView === item.id}
                  onClick={() => {
                    setCurrentView(item.id);
                    if (isMobile) setDrawerOpen(false);
                  }}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItem>
              ))}
            </List>
          </Box>
        </Drawer>

        {/* Main Content */}
        <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
          {currentView === 'dashboard' && (
            <Box>
              {/* Safety Score Banner */}
              {typeof mobileScore === 'number' && (
                <Paper sx={{ p: 2, mb: 3, bgcolor: mobileScore >= 700 ? 'success.light' : mobileScore >= 400 ? 'warning.light' : 'error.light' }}>
                  <Typography variant="h6" gutterBottom>
                    {t.safetyScore} ({currentRegion}): {mobileScore}/900
                  </Typography>
                  <Typography variant="body2">
                    {currentRisk ? `${t.currentZoneRisk}: ${currentRisk}` : t.outsideZone}
                  </Typography>
                </Paper>
              )}

              {/* Status Cards */}
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
                <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: coords ? 'success.main' : 'warning.main' }} />
                  <Box>
                    <Typography variant="subtitle2">GPS</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {coords ? `Lat ${coords.latitude?.toFixed(5)}, Lng ${coords.longitude?.toFixed(5)}` : 'Awaiting location…'}
                    </Typography>
                  </Box>
                </Paper>

                <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: backendStatus === 'online' ? 'success.main' : backendStatus === 'checking' ? 'warning.main' : 'error.main' }} />
                  <Box>
                    <Typography variant="subtitle2">Backend</Typography>
                    <Typography variant="caption" color="text.secondary">{backendStatus}</Typography>
                  </Box>
                </Paper>

                <Paper sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="subtitle2">Queued Alerts</Typography>
                    <Typography variant="caption" color="text.secondary">Auto-retry every 8s</Typography>
                  </Box>
                  <Chip label={(() => { try { return JSON.parse(localStorage.getItem('panicQueue')||'[]').length } catch { return 0 } })()} color="primary" />
                </Paper>
              </Box>

              {/* GPS Tracking Toggle */}
              <Paper sx={{ p: 2, mb: 3 }}>
                <FormControlLabel
                  control={<Switch checked={track} onChange={(e) => setTrack(e.target.checked)} />}
                  label="GPS Tracking"
                />
                <Typography variant="caption" display="block" color="text.secondary">
                  {lastGpsAt ? `Last ping: ${new Date(lastGpsAt).toLocaleTimeString()}` : 'Off'}
                </Typography>
              </Paper>

              {/* Panic Alert Section */}
              <Paper sx={{ p: 3, mb: 3, textAlign: 'center' }}>
                <Typography variant="h4" color="error" gutterBottom>🚨 {t.panic}</Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>{t.tapToSend}</Typography>
                <button
                  onClick={sendPanicAlert}
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: loading ? '#ccc' : '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '24px',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                    transition: 'all 0.3s ease'
                  }}
                >
                  {loading ? "Sending..." : t.send}
                </button>
                
                {/* Soft Alerts */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, mt: 2 }}>
                  <button
                    onClick={() => sendSoftAlert('safe')}
                    disabled={loading}
                    style={{
                      padding: '12px',
                      border: '1px solid #16a34a',
                      color: '#16a34a',
                      backgroundColor: 'transparent',
                      borderRadius: '8px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    👍 I'm Safe
                  </button>
                  <button
                    onClick={() => sendSoftAlert('low_battery')}
                    disabled={loading}
                    style={{
                      padding: '12px',
                      border: '1px solid #ca8a04',
                      color: '#ca8a04',
                      backgroundColor: 'transparent',
                      borderRadius: '8px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    🔋 Low Battery
                  </button>
                </Box>

                {coords && (
                  <Typography variant="caption" display="block" sx={{ mt: 2, color: 'text.secondary' }}>
                    📍 Your Location: Latitude {coords.latitude}, Longitude {coords.longitude}
                  </Typography>
                )}
                {lastSentAt && (
                  <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                    {t.lastSent}: {new Date(lastSentAt).toLocaleString()}
                  </Typography>
                )}
              </Paper>

              {/* Message Display */}
              {message && (
                <Paper sx={{ p: 2, mb: 3, bgcolor: message.includes("successfully") ? 'success.light' : 'error.light', color: message.includes("successfully") ? 'success.contrastText' : 'error.contrastText' }}>
                  <Typography variant="body2" fontWeight="bold">{message}</Typography>
                </Paper>
              )}
            </Box>
          )}

          {currentView === 'alerts' && (
            <Box>
              <Typography variant="h5" gutterBottom>Alert History</Typography>
              {renderAlertsTable()}
            </Box>
          )}

          {currentView === 'security' && (
            <Box>
              <Typography variant="h5" gutterBottom>Digital ID</Typography>
              <Paper sx={{ p: 3, mb: 3 }}>
                {didToken ? (
                  <Typography color="success.main" sx={{ mb: 2 }}>Active token present.</Typography>
                ) : (
                  <Typography color="warning.main" sx={{ mb: 2 }}>No active token. Issue one for secured alerts.</Typography>
                )}
                
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 2 }}>
                  <Box>
                    <Typography variant="body2" gutterBottom>Doc Type</Typography>
                    <select value={kycType} onChange={e=>setKycType(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                      <option value="passport">Passport</option>
                      <option value="aadhaar">Aadhaar</option>
                    </select>
                  </Box>
                  <Box>
                    <Typography variant="body2" gutterBottom>Doc Number</Typography>
                    <input value={kycNumber} onChange={e=>setKycNumber(e.target.value)} placeholder="Enter number" style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                  </Box>
                  <Box>
                    <Typography variant="body2" gutterBottom>Trip Days</Typography>
                    <input type="number" min={1} max={60} value={tripDays} onChange={e=>setTripDays(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'end' }}>
                    <button onClick={issueDid} disabled={loading || !kycNumber} style={{ width: '100%', padding: '8px', backgroundColor: loading ? '#ccc' : '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer' }}>Issue ID</button>
                  </Box>
                </Box>
                
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2, mb: 2 }}>
                  <Box>
                    <Typography variant="body2" gutterBottom>Itinerary (notes)</Typography>
                    <input value={itinerary} onChange={e=>setItinerary(e.target.value)} placeholder="e.g., Guwahati → Kaziranga → Majuli" style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                  </Box>
                  <Box>
                    <Typography variant="body2" gutterBottom>Emergency Contacts (comma-separated)</Typography>
                    <input value={emergencyContacts} onChange={e=>setEmergencyContacts(e.target.value)} placeholder="e.g., +91-98..., +91-88..." style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                  </Box>
                </Box>
                
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <button onClick={verifyDid} disabled={loading || !didToken} style={{ padding: '8px 16px', border: didToken ? '1px solid #2563eb' : '1px solid #ccc', color: didToken ? '#2563eb' : '#999', backgroundColor: 'transparent', borderRadius: '4px', cursor: didToken ? 'pointer' : 'not-allowed' }}>Verify ID</button>
                  <button onClick={clearDid} style={{ padding: '8px 16px', border: '1px solid #dc2626', color: '#dc2626', backgroundColor: 'transparent', borderRadius: '4px', cursor: 'pointer' }}>Clear ID</button>
                </Box>
              </Paper>
              
              {/* My ID card */}
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>{t.myId}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t.showToResponders}</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr' }, gap: 3, alignItems: 'center' }}>
                  <Box>
                    <Typography variant="body2"><strong>{t.touristId}:</strong> <span style={{ fontFamily: 'monospace' }}>{touristId || '—'}</span></Typography>
                    <Typography variant="body2"><strong>{t.deviceId}:</strong> <span style={{ fontFamily: 'monospace' }}>{deviceId || '—'}</span></Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Box sx={{ p: 1, border: '1px solid #e5e7eb', borderRadius: '8px', bgcolor: 'background.paper' }}>
                      <QRCode value={JSON.stringify({ touristId, deviceId })} size={120} />
                    </Box>
                  </Box>
                </Box>
              </Paper>
            </Box>
          )}

          {currentView === 'location' && (
            <Box>
              <Typography variant="h5" gutterBottom>Location Services</Typography>
              {/* Location content will go here */}
            </Box>
          )}

          {currentView === 'contacts' && (
            <Box>
              <Typography variant="h5" gutterBottom>Emergency Contacts</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)' }, gap: 2 }}>
                {contacts.map((c, idx) => (
                  <Paper key={idx} sx={{ p: 2, textAlign: 'center', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }} onClick={() => window.open(`tel:${c.phone}`)}>
                    <Typography variant="subtitle2" gutterBottom>{lang === 'as' ? c.labelAs : c.labelEn}</Typography>
                    <Typography variant="caption" color="text.secondary">{c.phone}</Typography>
                  </Paper>
                ))}
              </Box>
            </Box>
          )}

          {currentView === 'settings' && (
            <Box>
              <Typography variant="h5" gutterBottom>Settings</Typography>
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Tourist Registration</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2, mb: 3 }}>
                  <Box>
                    <Typography variant="body2" gutterBottom>Name</Typography>
                    <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Name" style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                  </Box>
                  <Box>
                    <Typography variant="body2" gutterBottom>Phone</Typography>
                    <input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder={t.phone} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                  </Box>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" gutterBottom>Aadhaar (12 digits, required)</Typography>
                  <input value={aadhaar} onChange={(e)=>setAadhaar(e.target.value)} placeholder={t.aadhaar || 'Aadhaar (12 digits, required)'} inputMode="numeric" maxLength={12} pattern="\\d{12}" style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                </Box>
                <button onClick={registerTourist} disabled={loading} style={{ width: '100%', padding: '12px', backgroundColor: loading ? '#ccc' : '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer', marginBottom: '16px' }}>Register Tourist</button>
                {touristId && <Typography variant="body2" color="text.secondary">{t.touristId}: <span style={{ fontFamily: 'monospace' }}>{touristId}</span></Typography>}
              </Paper>
              
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Device Pairing</Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" gutterBottom>BLE Address (optional)</Typography>
                  <input value={bleAddress} onChange={(e)=>setBleAddress(e.target.value)} placeholder={t.bleOptional} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }} />
                </Box>
                <button onClick={pairDevice} disabled={loading || !touristId} style={{ width: '100%', padding: '12px', backgroundColor: loading || !touristId ? '#ccc' : '#7c3aed', color: 'white', border: 'none', borderRadius: '4px', cursor: loading || !touristId ? 'not-allowed' : 'pointer', marginBottom: '16px' }}>Pair Device</button>
                {deviceId && <Typography variant="body2" color="text.secondary">{t.deviceId}: <span style={{ fontFamily: 'monospace' }}>{deviceId}</span></Typography>}
              </Paper>
              
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>Appearance</Typography>
                <FormControlLabel
                  control={<Switch checked={dark} onChange={(e) => setDark(e.target.checked)} />}
                  label="Dark Mode"
                />
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" gutterBottom>Language</Typography>
                  <select value={lang} onChange={(e)=>setLang(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}>
                    <option value="en">English</option>
                    <option value="as">অসমীয়া (Assamese)</option>
                    <option value="bn">বাংলা (Bengali)</option>
                    <option value="brx">Bodo</option>
                    <option value="mni">Manipuri</option>
                    <option value="kha">Khasi</option>
                    <option value="grt">Garo</option>
                    <option value="lus">Mizo</option>
                  </select>
                </Box>
              </Paper>
            </Box>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
