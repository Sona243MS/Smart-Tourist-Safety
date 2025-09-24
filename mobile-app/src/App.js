import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useGeolocated } from "react-geolocated";
import logo from "./assets/logo.svg";
import QRCode from "react-qr-code";
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
  // DID state
  const [didToken, setDidToken] = useState("");
  const [kycType, setKycType] = useState('passport');
  const [kycNumber, setKycNumber] = useState('');
  const [tripDays, setTripDays] = useState(14);

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
      const body = { kycType, kycHash: hash, validDays: Number(tripDays) || 14 };
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
    return () => { clearInterval(interval); clearInterval(ping); };
  }, []);

  // Persist mobile UI prefs
  useEffect(() => {
    try { localStorage.setItem('mobile.dark', dark ? '1' : '0'); } catch {}
  }, [dark]);
  useEffect(() => {
    try { localStorage.setItem('mobile.lang', lang || 'en'); } catch {}
  }, [lang]);

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
      const res = await axios.post("/tourists/register", { name, phone });
      if (res.data?.ok && res.data.touristId) {
        setTouristId(res.data.touristId);
        localStorage.setItem("touristId", res.data.touristId);
        setMessage("✅ Tourist registered");
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
      <div className="flex items-center justify-center h-screen text-red-600 text-xl font-semibold">
        Your browser does not support Geolocation.
      </div>
    );
  }

  if (!isGeolocationEnabled) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600 text-xl font-semibold">
        Geolocation is not enabled. Please enable location access.
      </div>
    );
  }

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-gradient-to-b from-red-50 via-white to-red-100 dark:from-gray-900 dark:via-gray-900 dark:to-black dark:text-gray-100">
      {/* Header with logo */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/70 backdrop-blur border-b border-red-100 dark:border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={logo} alt="Smart Tourist Safety" className="w-9 h-9" />
          <div>
            <h1 className="text-lg font-bold text-red-700 dark:text-red-400 leading-5">{t.appTitle}</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t.subtitle}</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <label className="text-xs text-gray-600 dark:text-gray-300 mr-1">Dark</label>
            <input type="checkbox" checked={dark} onChange={(e)=>setDark(e.target.checked)} />
            <label className="text-xs text-gray-600 mr-2">{t.language}:</label>
            <select value={lang} onChange={(e)=>setLang(e.target.value)} className="text-xs border rounded px-2 py-1">
              <option value="en">English</option>
              <option value="as">অসমীয়া (Assamese)</option>
              <option value="bn">বাংলা (Bengali)</option>
              <option value="brx">Bodo</option>
              <option value="mni">Manipuri</option>
              <option value="kha">Khasi</option>
              <option value="grt">Garo</option>
              <option value="lus">Mizo</option>
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Safety banner */}
        {typeof mobileScore === 'number' && (
          <div className="mb-4 p-3 rounded-xl border" style={{
            background: mobileScore >= 700 ? '#eafaf1' : mobileScore >= 400 ? '#fef9e7' : '#fdecea',
            borderColor: mobileScore >= 700 ? '#2ecc71' : mobileScore >= 400 ? '#f1c40f' : '#e74c3c'
          }}>
            <div className="text-sm text-gray-700"><strong>{t.safetyScore} ({currentRegion}):</strong> {mobileScore}/900</div>
            <div className="text-xs text-gray-500">{currentRisk ? `${t.currentZoneRisk}: ${currentRisk}` : t.outsideZone}</div>
          </div>
        )}
        {/* Status chips */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg border p-3 bg-white flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${coords ? 'bg-green-500' : 'bg-yellow-400'}`}></span>
            <div>
              <div className="text-sm font-medium">GPS</div>
              <div className="text-xs text-gray-500">{coords ? `Lat ${coords.latitude?.toFixed(5)}, Lng ${coords.longitude?.toFixed(5)}` : 'Awaiting location…'}</div>
            </div>
          </div>
          <div className="rounded-lg border p-3 bg-white flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${backendStatus === 'online' ? 'bg-green-500' : backendStatus === 'checking' ? 'bg-yellow-400' : 'bg-red-500'}`}></span>
            <div>
              <div className="text-sm font-medium">Backend</div>
              <div className="text-xs text-gray-500">{backendStatus}</div>
            </div>
          </div>
          <div className="rounded-lg border p-3 bg-white flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Queued Alerts</div>
              <div className="text-xs text-gray-500">Auto-retry every 8s</div>
            </div>
            <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full bg-gray-100 text-sm font-semibold text-gray-700">
              {(() => { try { return JSON.parse(localStorage.getItem('panicQueue')||'[]').length } catch { return 0 } })()}
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 dark:border-gray-700 shadow-lg rounded-2xl p-6 md:p-8 border border-transparent">
          {/* Digital ID (DID) */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">Digital ID</h3>
            {didToken ? (
              <div className="text-sm text-green-700 dark:text-green-400 mb-2">Active token present.</div>
            ) : (
              <div className="text-sm text-yellow-700 mb-2">No active token. Issue one for secured alerts.</div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
              <label className="text-sm">Doc Type
                <select value={kycType} onChange={e=>setKycType(e.target.value)} className="w-full border rounded p-2">
                  <option value="passport">Passport</option>
                  <option value="aadhaar">Aadhaar</option>
                </select>
              </label>
              <label className="text-sm">Doc Number
                <input value={kycNumber} onChange={e=>setKycNumber(e.target.value)} placeholder="Enter number" className="w-full border rounded p-2" />
              </label>
              <label className="text-sm">Trip Days
                <input type="number" min={1} max={60} value={tripDays} onChange={e=>setTripDays(e.target.value)} className="w-full border rounded p-2" />
              </label>
              <button onClick={issueDid} disabled={loading || !kycNumber} className={`w-full py-2 rounded text-white font-semibold ${loading?"bg-gray-400":"bg-emerald-600 hover:bg-emerald-700"}`}>Issue ID</button>
            </div>
            <div className="mt-2 flex gap-2">
              <button onClick={verifyDid} disabled={loading || !didToken} className={`px-3 py-2 rounded border ${didToken?"border-blue-600 text-blue-700 hover:bg-blue-50":"border-gray-300 text-gray-400"}`}>Verify ID</button>
              <button onClick={clearDid} className="px-3 py-2 rounded border border-red-600 text-red-700 hover:bg-red-50">Clear ID</button>
            </div>
          </div>
          {/* My ID card */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="md:col-span-2">
              <h3 className="text-lg font-semibold text-gray-800">{t.myId}</h3>
              <p className="text-sm text-gray-600">{t.showToResponders}</p>
              <div className="mt-2 text-sm">
                <div>{t.touristId}: <span className="font-mono">{touristId || '—'}</span></div>
                <div>{t.deviceId}: <span className="font-mono">{deviceId || '—'}</span></div>
              </div>
            </div>
            <div className="flex justify-center">
              <div className="bg-white dark:bg-gray-900 p-2 rounded-lg border dark:border-gray-700">
                <QRCode value={JSON.stringify({ touristId, deviceId })} size={120} />
              </div>
            </div>
          </div>

          {/* Emergency Contacts */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-2">{t.contacts}</h3>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {contacts.map((c, idx) => (
                <a key={idx} href={`tel:${c.phone}`} className="text-center border rounded-lg py-3 hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700">
                  <div className="font-semibold">{lang === 'as' ? c.labelAs : c.labelEn}</div>
                  <div className="text-xs text-gray-500">{c.phone}</div>
                </a>
              ))}
            </div>
          </div>

          <h2 className="text-xl font-semibold text-gray-800 mb-4">{t.setup}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-2">{t.registerTourist}</h3>
              <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Name" className="w-full border rounded p-2 mb-2" />
              <input value={phone} onChange={(e)=>setPhone(e.target.value)} placeholder={t.phone} className="w-full border rounded p-2 mb-2" />
              <button onClick={registerTourist} disabled={loading} className={`w-full py-2 rounded text-white font-semibold ${loading?"bg-gray-400":"bg-blue-600 hover:bg-blue-700"}`}>Register</button>
              {touristId && <p className="text-sm text-gray-600 mt-2">{t.touristId}: <span className="font-mono">{touristId}</span></p>}
            </div>
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-2">{t.pairDevice}</h3>
              <input value={bleAddress} onChange={(e)=>setBleAddress(e.target.value)} placeholder={t.bleOptional} className="w-full border rounded p-2 mb-2" />
              <button onClick={pairDevice} disabled={loading || !touristId} className={`w-full py-2 rounded text-white font-semibold ${loading||!touristId?"bg-gray-400":"bg-indigo-600 hover:bg-indigo-700"}`}>Pair</button>
              {deviceId && <p className="text-sm text-gray-600 mt-2">{t.deviceId}: <span className="font-mono">{deviceId}</span></p>}
            </div>
          </div>
          <h1 className="text-3xl font-bold text-red-700 mb-3">🚨 {t.panic}</h1>
          <p className="text-gray-700 mb-4">{t.tapToSend}</p>
          <button
            onClick={sendPanicAlert}
            disabled={loading}
            className={`w-full py-3 rounded-full text-white text-xl font-bold shadow-md transition-colors duration-300
              ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"}`}
          >
            {loading ? "Sending..." : t.send}
          </button>

          {/* Soft alerts */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => sendSoftAlert('safe')}
              className="w-full py-2 rounded border border-green-600 text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20 dark:text-green-400 dark:border-green-700"
            >
              👍 I'm Safe
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => sendSoftAlert('low_battery')}
              className="w-full py-2 rounded border border-yellow-600 text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700"
            >
              🔋 Low Battery
            </button>
          </div>

          {coords && (
            <p className="mt-4 text-gray-600">
              📍 Your Location: Latitude {coords.latitude}, Longitude {coords.longitude}
            </p>
          )}
          {lastSentAt && (
            <p className="mt-1 text-xs text-gray-500">{t.lastSent}: {new Date(lastSentAt).toLocaleString()}</p>
          )}

          {/* Share location link */}
          <div className="mt-3 flex items-center gap-3">
            <a href={mapShareUrl || '#'} target="_blank" rel="noreferrer" className="text-sm text-blue-600 underline dark:text-blue-400">
              {t.shareLoc}
            </a>
            <button onClick={copyShareLink} className="text-sm border rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 dark:border-gray-700">
              {t.copyLink}
            </button>
          </div>

          {message && (
            <div
              className={`mt-4 p-3 rounded-lg text-white font-semibold ${
                message.includes("successfully") ? "bg-green-500" : "bg-red-500"
              }`}
            >
              {message}
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  );
}

export default App;
