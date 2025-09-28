const EventEmitter = require('events');

// Comprehensive Multilingual Support Service
class MultilingualService extends EventEmitter {
  constructor() {
    super();
    this.supportedLanguages = [
      { code: 'en', name: 'English', script: 'latin' },
      { code: 'hi', name: 'हिन्दी', script: 'devanagari' },
      { code: 'bn', name: 'বাংলা', script: 'bengali' },
      { code: 'te', name: 'తెలుగు', script: 'telugu' },
      { code: 'mr', name: 'मराठी', script: 'devanagari' },
      { code: 'ta', name: 'தமிழ்', script: 'tamil' },
      { code: 'ur', name: 'اردو', script: 'arabic' },
      { code: 'gu', name: 'ગુજરાતી', script: 'gujarati' },
      { code: 'kn', name: 'ಕನ್ನಡ', script: 'kannada' },
      { code: 'or', name: 'ଓଡ଼ିଆ', script: 'odia' },
      { code: 'as', name: 'অসমীয়া', script: 'bengali' },
      { code: 'pa', name: 'ਪੰਜਾਬੀ', script: 'gurmukhi' },
      { code: 'ml', name: 'മലയാളം', script: 'malayalam' },
      { code: 'ne', name: 'नेपाली', script: 'devanagari' },
      { code: 'brx', name: 'Bodo', script: 'latin' },
      { code: 'mni', name: 'Manipuri', script: 'bengali' },
      { code: 'kha', name: 'Khasi', script: 'latin' },
      { code: 'grt', name: 'Garo', script: 'latin' },
      { code: 'lus', name: 'Mizo', script: 'latin' }
    ];
    
    this.translations = new Map();
    this.voiceSettings = new Map();
    this.emergencyPhrases = new Map();
    this.initializeTranslations();
    this.initializeVoiceSettings();
    this.initializeEmergencyPhrases();
  }

  // Initialize comprehensive translations
  initializeTranslations() {
    const commonTranslations = {
      // Emergency phrases
      'emergency': {
        en: 'Emergency',
        hi: 'आपातकाल',
        bn: 'জরুরি',
        te: 'అత్యవసర',
        mr: 'आणीबाणी',
        ta: 'அவசரம்',
        ur: 'ہنگامی',
        gu: 'કટોકટી',
        kn: 'ತುರ್ತು',
        or: 'ଜରୁରୀ',
        as: 'জৰুৰী',
        pa: 'ਜ਼ਰੂਰੀ',
        ml: 'അടിയന്തര',
        ne: 'आपत्काल',
        brx: 'जोरजोरनि',
        mni: 'জরুরী',
        kha: 'Emergency',
        grt: 'Emergency',
        lus: 'Emergency'
      },
      'panic_button': {
        en: 'Panic Button',
        hi: 'पैनिक बटन',
        bn: 'প্যানিক বোতাম',
        te: 'పానిక్ బటన్',
        mr: 'पॅनिक बटण',
        ta: 'பீதி பொத்தான்',
        ur: 'پینک بٹن',
        gu: 'પેનિક બટન',
        kn: 'ಪ್ಯಾನಿಕ್ ಬಟನ್',
        or: 'ପ୍ୟାନିକ୍ ବଟନ୍',
        as: 'পেনিক বুটাম',
        pa: 'ਪੈਨਿਕ ਬਟਨ',
        ml: 'പാനിക് ബട്ടൺ',
        ne: 'प्यानिक बटन',
        brx: 'जोरजोरनि बुं',
        mni: 'পেনিক বুটাম',
        kha: 'Panic Button',
        grt: 'Panic Button',
        lus: 'Panic Button'
      },
      'help_me': {
        en: 'Help Me',
        hi: 'मेरी मदद करें',
        bn: 'আমাকে সাহায্য করুন',
        te: 'నాకు సహాయం చేయండి',
        mr: 'मला मदत करा',
        ta: 'எனக்கு உதவுங்கள்',
        ur: 'میری مدد کریں',
        gu: 'મને મદદ કરો',
        kn: 'ನನಗೆ ಸಹಾಯ ಮಾಡಿ',
        or: 'ମୋତେ ସାହାଯ୍ୟ କର',
        as: 'মোক সহায় কৰক',
        pa: 'ਮੇਰੀ ਮਦਦ ਕਰੋ',
        ml: 'എന്നെ സഹായിക്കുക',
        ne: 'मलाई मद्दत गर्नुहोस्',
        brx: 'आंनि थाखायनाय',
        mni: 'মোক সহায় কৰক',
        kha: 'Help Me',
        grt: 'Help Me',
        lus: 'Help Me'
      },
      'call_police': {
        en: 'Call Police',
        hi: 'पुलिस को बुलाएं',
        bn: 'পুলিশকে ডাকুন',
        te: 'పోలీసులను పిలవండి',
        mr: 'पोलिसांना कॉल करा',
        ta: 'காவல்துறையை அழைக்கவும்',
        ur: 'پولیس کو کال کریں',
        gu: 'પોલીસને કૉલ કરો',
        kn: 'ಪೊಲೀಸರನ್ನು ಕರೆ ಮಾಡಿ',
        or: 'ପୋଲିସକୁ କଲ୍ କରନ୍ତୁ',
        as: 'পুলিচক মাতক',
        pa: 'ਪੁਲਿਸ ਨੂੰ ਕਾਲ ਕਰੋ',
        ml: 'പോലീസിനെ വിളിക്കുക',
        ne: 'प्रहरीलाई कल गर्नुहोस्',
        brx: 'Police कल',
        mni: 'পুলিচক মাতক',
        kha: 'Call Police',
        grt: 'Call Police',
        lus: 'Call Police'
      },
      'my_location': {
        en: 'My Location',
        hi: 'मेरा स्थान',
        bn: 'আমার অবস্থান',
        te: 'నా స్థానం',
        mr: 'माझे स्थान',
        ta: 'என் இடம்',
        ur: 'میری جگہ',
        gu: 'મારું સ્થાન',
        kn: 'ನನ್ನ ಸ್ಥಳ',
        or: 'ମୋ ସ୍ଥାନ',
        as: 'মোৰ স্থান',
        pa: 'ਮੇਰਾ ਟਿਕਾਣਾ',
        ml: 'എന്റെ സ്ഥാനം',
        ne: 'मेरो स्थान',
        brx: 'आंनि थं',
        mni: 'মোৰ স্থান',
        kha: 'My Location',
        grt: 'My Location',
        lus: 'My Location'
      },
      'safe': {
        en: 'I am Safe',
        hi: 'मैं सुरक्षित हूं',
        bn: 'আমি নিরাপদ',
        te: 'నేను సురక్షితంగా ఉన్నాను',
        mr: 'मी सुरक्षित आहे',
        ta: 'நான் பாதுகாப்பாக இருக்கிறேன்',
        ur: 'میں محفوظ ہوں',
        gu: 'હું સુરક્ષિત છું',
        kn: 'ನಾನು ಸುರಕ್ಷಿತ',
        or: 'ମୁଁ ସୁରକ୍ଷିତ',
        as: 'মই নিৰাপদ',
        pa: 'ਮੈਂ ਸੁਰੱਖਿਅਤ ਹਾਂ',
        ml: 'ഞാൻ സുരക്ഷിതമാണ്',
        ne: 'म सुरक्षित छु',
        brx: 'आं सुरक्षित',
        mni: 'মই নিৰাপদ',
        kha: 'I am Safe',
        grt: 'I am Safe',
        lus: 'I am Safe'
      }
    };

    // Store translations
    Object.keys(commonTranslations).forEach(key => {
      this.translations.set(key, commonTranslations[key]);
    });
  }

  // Initialize voice settings for different languages
  initializeVoiceSettings() {
    this.supportedLanguages.forEach(lang => {
      this.voiceSettings.set(lang.code, {
        language: lang.code,
        voice: this.getDefaultVoice(lang.code),
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        enabled: true
      });
    });
  }

  // Initialize emergency phrases for voice recognition
  initializeEmergencyPhrases() {
    const emergencyPhrases = [
      'help', 'emergency', 'panic', 'police', 'ambulance', 'fire',
      'danger', 'attack', 'robbery', 'accident', 'medical', 'hospital',
      'safe', 'location', 'lost', 'stolen', 'threat', 'urgent'
    ];

    emergencyPhrases.forEach(phrase => {
      this.emergencyPhrases.set(phrase, {
        phrase,
        translations: this.getTranslations(phrase),
        priority: this.getPhrasePriority(phrase)
      });
    });
  }

  // Get translation for a key in specific language
  getTranslation(key, language = 'en') {
    const translations = this.translations.get(key);
    if (!translations) return key;
    
    return translations[language] || translations['en'] || key;
  }

  // Get all translations for a key
  getTranslations(key) {
    return this.translations.get(key) || { en: key };
  }

  // Translate text using simple word mapping (in production, use proper translation API)
  translateText(text, fromLang = 'en', toLang = 'en') {
    if (fromLang === toLang) return text;
    
    // Simple word-by-word translation (in production, use Google Translate API or similar)
    const words = text.toLowerCase().split(' ');
    const translatedWords = words.map(word => {
      // Check if word exists in our translation map
      for (const [key, translations] of this.translations) {
        if (translations[fromLang] && translations[fromLang].toLowerCase() === word) {
          return translations[toLang] || word;
        }
      }
      return word; // Return original if no translation found
    });
    
    return translatedWords.join(' ');
  }

  // Get supported languages
  getSupportedLanguages() {
    return this.supportedLanguages;
  }

  // Get language by code
  getLanguage(code) {
    return this.supportedLanguages.find(lang => lang.code === code);
  }

  // Get default voice for language
  getDefaultVoice(languageCode) {
    const voiceMap = {
      'en': 'en-US',
      'hi': 'hi-IN',
      'bn': 'bn-BD',
      'te': 'te-IN',
      'mr': 'mr-IN',
      'ta': 'ta-IN',
      'ur': 'ur-PK',
      'gu': 'gu-IN',
      'kn': 'kn-IN',
      'or': 'or-IN',
      'as': 'as-IN',
      'pa': 'pa-IN',
      'ml': 'ml-IN',
      'ne': 'ne-NP',
      'brx': 'en-US', // Fallback to English
      'mni': 'bn-IN', // Use Bengali voice
      'kha': 'en-US', // Fallback to English
      'grt': 'en-US', // Fallback to English
      'lus': 'en-US'  // Fallback to English
    };
    
    return voiceMap[languageCode] || 'en-US';
  }

  // Get phrase priority for emergency detection
  getPhrasePriority(phrase) {
    const highPriority = ['help', 'emergency', 'panic', 'police', 'ambulance', 'fire', 'danger', 'attack'];
    const mediumPriority = ['robbery', 'accident', 'medical', 'hospital', 'threat', 'urgent'];
    const lowPriority = ['safe', 'location', 'lost', 'stolen'];
    
    if (highPriority.includes(phrase)) return 'high';
    if (mediumPriority.includes(phrase)) return 'medium';
    if (lowPriority.includes(phrase)) return 'low';
    return 'low';
  }

  // Process voice input for emergency detection
  processVoiceInput(audioData, language = 'en') {
    // In production, this would use speech-to-text API
    // For now, return mock processing
    return {
      text: 'help emergency',
      confidence: 0.95,
      language,
      detectedPhrases: ['help', 'emergency'],
      emergencyLevel: 'high',
      timestamp: new Date().toISOString()
    };
  }

  // Generate voice response
  generateVoiceResponse(text, language = 'en') {
    const voiceSettings = this.voiceSettings.get(language);
    if (!voiceSettings || !voiceSettings.enabled) {
      return null;
    }

    return {
      text,
      language,
      voice: voiceSettings.voice,
      rate: voiceSettings.rate,
      pitch: voiceSettings.pitch,
      volume: voiceSettings.volume,
      audioUrl: this.generateAudioUrl(text, language) // In production, generate actual audio
    };
  }

  // Generate audio URL (mock implementation)
  generateAudioUrl(text, language) {
    // In production, this would call text-to-speech API
    return `https://api.example.com/tts?text=${encodeURIComponent(text)}&lang=${language}`;
  }

  // Get emergency phrases for language
  getEmergencyPhrases(language = 'en') {
    const phrases = [];
    for (const [phrase, data] of this.emergencyPhrases) {
      phrases.push({
        phrase,
        translation: data.translations[language] || data.translations['en'],
        priority: data.priority
      });
    }
    return phrases.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  // Update voice settings
  updateVoiceSettings(language, settings) {
    const currentSettings = this.voiceSettings.get(language);
    if (!currentSettings) return false;

    this.voiceSettings.set(language, {
      ...currentSettings,
      ...settings
    });

    this.emit('voiceSettingsUpdated', { language, settings });
    return true;
  }

  // Get voice settings for language
  getVoiceSettings(language) {
    return this.voiceSettings.get(language);
  }

  // Enable/disable voice for language
  setVoiceEnabled(language, enabled) {
    const settings = this.voiceSettings.get(language);
    if (!settings) return false;

    settings.enabled = enabled;
    this.voiceSettings.set(language, settings);
    
    this.emit('voiceEnabledChanged', { language, enabled });
    return true;
  }

  // Get text direction for language
  getTextDirection(language) {
    const rtlLanguages = ['ur', 'ar']; // Right-to-left languages
    return rtlLanguages.includes(language) ? 'rtl' : 'ltr';
  }

  // Get script for language
  getScript(language) {
    const lang = this.getLanguage(language);
    return lang ? lang.script : 'latin';
  }

  // Format number according to language
  formatNumber(number, language = 'en') {
    // In production, use proper number formatting for each language
    return new Intl.NumberFormat(language).format(number);
  }

  // Format date according to language
  formatDate(date, language = 'en') {
    return new Intl.DateTimeFormat(language, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  }

  // Get emergency contact names in language
  getEmergencyContactNames(language = 'en') {
    const contacts = {
      police: this.getTranslation('police', language),
      ambulance: this.getTranslation('ambulance', language),
      fire: this.getTranslation('fire', language),
      hospital: this.getTranslation('hospital', language),
      tourist_helpline: this.getTranslation('tourist_helpline', language)
    };
    
    return contacts;
  }

  // Generate multilingual emergency message
  generateEmergencyMessage(incidentType, language = 'en') {
    const messages = {
      panic: {
        en: 'Emergency! Tourist needs immediate help at location.',
        hi: 'आपातकाल! पर्यटक को तत्काल सहायता की आवश्यकता है।',
        bn: 'জরুরি! পর্যটকের তাত্ক্ষণিক সাহায্যের প্রয়োজন।',
        te: 'అత్యవసరం! పర్యాటకుడికి తక్షణ సహాయం అవసరం.',
        mr: 'आणीबाणी! पर्यटकाला त्वरित मदत हवी.',
        ta: 'அவசரம்! சுற்றுலா பயணிக்கு உடனடி உதவி தேவை.',
        ur: 'ہنگامی! سیاح کو فوری مدد کی ضرورت ہے۔',
        gu: 'કટોકટી! પર્યટકને તાત્કાલિક મદદની જરૂર છે.',
        kn: 'ತುರ್ತು! ಪ್ರವಾಸಿಗರಿಗೆ ತಕ್ಷಣ ಸಹಾಯ ಬೇಕು.',
        or: 'ଜରୁରୀ! ପର୍ଯ୍ୟଟକଙ୍କୁ ତୁରନ୍ତ ସାହାଯ୍ୟ ଦରକାର।',
        as: 'জৰুৰী! পৰ্যটকৰ তৎক্ষণাত সহায়ৰ প্ৰয়োজন।',
        pa: 'ਜ਼ਰੂਰੀ! ਸੈਲਾਨੀ ਨੂੰ ਤੁਰੰਤ ਮਦਦ ਦੀ ਲੋੜ ਹੈ।',
        ml: 'അടിയന്തരം! സഞ്ചാരിക്ക് ഉടനടി സഹായം ആവശ്യമാണ്।',
        ne: 'आपत्काल! पर्यटकलाई तत्काल मद्दत चाहिन्छ।',
        brx: 'जोरजोरनि! टुरिस्टनि सिगांलां थाखायनाय जाबाय।',
        mni: 'জরুরী! পর্যটকৰ তৎক্ষণাত সহায়ৰ প্ৰয়োজন।',
        kha: 'Emergency! Tourist needs immediate help.',
        grt: 'Emergency! Tourist needs immediate help.',
        lus: 'Emergency! Tourist needs immediate help.'
      }
    };

    return messages[incidentType]?.[language] || messages[incidentType]?.['en'] || 'Emergency alert';
  }

  // Get language statistics
  getLanguageStatistics() {
    const stats = {};
    this.supportedLanguages.forEach(lang => {
      stats[lang.code] = {
        name: lang.name,
        script: lang.script,
        voiceEnabled: this.voiceSettings.get(lang.code)?.enabled || false,
        translationsAvailable: Object.keys(this.translations).length
      };
    });
    return stats;
  }

  // Add custom translation
  addCustomTranslation(key, translations) {
    this.translations.set(key, translations);
    this.emit('translationAdded', { key, translations });
  }

  // Remove custom translation
  removeCustomTranslation(key) {
    const removed = this.translations.delete(key);
    if (removed) {
      this.emit('translationRemoved', { key });
    }
    return removed;
  }
}

module.exports = new MultilingualService();
