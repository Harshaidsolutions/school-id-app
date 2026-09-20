export type InstructionLang = "te" | "en" | "hi";

export const INSTRUCTION_LANG_LABELS: Record<
  InstructionLang,
  { short: string; full: string }
> = {
  te: { short: "తెలుగు", full: "Telugu" },
  en: { short: "English", full: "English" },
  hi: { short: "हिन्दी", full: "Hindi" },
};

export type InstructionStep = {
  text: string;
  linkLabel?: string;
  linkUrl?: string;
};

const EN: InstructionStep[] = [
  { text: "Take clear and proper photos in good lighting." },
  { text: "Upload correct student data." },
  { text: "Choose the right template and model." },
  { text: "Upload logo, signature and other requirements." },
  { text: "Check all details before submitting." },
  { text: "ID cards will be printed as per the provided data." },
  { text: "No changes allowed after final submission." },
  { text: "Contact support for any assistance." },
  { text: "Use this app only for authorized purpose." },
  { text: "Follow all the above steps for best results." },
  {
    text: "This app works only on Android phones. It does not work on iPhones (iOS).",
  },
  {
    text: "Do not share your username and password with anyone without permission from the Principal or Admin.",
  },
  {
    text: "Please ask the Admin for a sample student photo. Check the sample photo carefully and take the students' photos in the same way.",
  },
  {
    text: "Make sure the student wears the full uniform and is looking straight at the phone camera. The student should stand straight and should not wear glasses or a cap. Make sure the student is not closing their eyes, looking sideways, or smiling too much.",
  },
  {
    text: "Make sure the background is one color. After taking the photo, check it carefully. If the photo is good, upload it. If not, take the photo again.",
  },
  {
    text: "Leave some space above the student's head and on both sides of the shoulders. Take the photo only up to the student's stomach.",
  },
  {
    text: "The username and password given to you will work for only 5 working days. Please complete the full student photo shoot within these 5 working days.",
  },
  {
    text: "If a student is absent, please call the parent and ask them to send the student's photo. Then upload the photo. You can also take the photo when the student comes to school.",
  },
];

const TE: InstructionStep[] = [
  { text: "మంచి వెలుతురులో స్పష్టమైన, సరైన ఫోటోలు తీయండి." },
  { text: "విద్యార్థి వివరాలను సరిగ్గా అప్‌లోడ్ చేయండి." },
  { text: "సరైన టెంప్లేట్ మరియు మోడల్‌ను ఎంచుకోండి." },
  { text: "లోగో, సంతకం మరియు ఇతర అవసరమైన వివరాలను అప్‌లోడ్ చేయండి." },
  { text: "సమర్పించే ముందు అన్ని వివరాలను తనిఖీ చేయండి." },
  { text: "అందించిన డేటా ప్రకారమే ID కార్డులు ముద్రించబడతాయి." },
  { text: "చివరి సమర్పణ తర్వాత మార్పులు అనుమతించబడవు." },
  { text: "ఏదైనా సహాయం కోసం సపోర్ట్‌ను సంప్రదించండి." },
  { text: "ఈ యాప్‌ను అనుమతించబడిన ఉద్దేశ్యానికి మాత్రమే ఉపయోగించండి." },
  { text: "ఉత్తమ ఫలితాల కోసం పైన పేర్కొన్న అన్ని దశలను పాటించండి." },
  {
    text: "ఈ యాప్ Android ఫోన్లలో మాత్రమే పని చేస్తుంది. iPhone (iOS) లో పని చేయదు.",
  },
  {
    text: "ప్రిన్సిపాల్ లేదా అడ్మిన్ అనుమతి లేకుండా మీ యూజర్‌నేమ్ మరియు పాస్‌వర్డ్‌ను ఎవరితోనూ పంచుకోవద్దు.",
  },
  {
    text: "నమూనా విద్యార్థి ఫోటో కోసం అడ్మిన్‌ను అడగండి. నమూనా ఫోటోను జాగ్రత్తగా చూసి, అదే విధంగా విద్యార్థుల ఫోటోలు తీయండి.",
  },
  {
    text: "విద్యార్థి పూర్తి యూనిఫారం ధరించి, ఫోన్ కెమెరా వైపు నేరుగా చూడాలి. నిటారుగా నిలబడాలి; కళ్లద్దాలు లేదా cap ధరించకూడదు. కళ్లు మూసుకోవడం, పక్కకు చూడడం, ఎక్కువగా నవ్వడం ఉండకూడదు.",
  },
  {
    text: "బ్యాక్‌గ్రౌండ్ ఒకే రంగులో ఉండాలి. ఫోటో తీసిన తర్వాత జాగ్రత్తగా చూడండి. బాగుంటే అప్‌లోడ్ చేయండి; లేకపోతే మళ్లీ తీయండి.",
  },
  {
    text: "తల పైన, భుజాలు రెండు వైపులా కొంత ఖాళీ ఉండేలా చూడండి. విద్యార్థి stomach వరకు మాత్రమే ఫోటో తీయండి.",
  },
  {
    text: "మీకు ఇచ్చిన యూజర్‌నేమ్ మరియు పాస్‌వర్డ్ 5 పని దినాలు మాత్రమే పని చేస్తాయి. ఈ 5 రోజుల్లోనే అన్ని విద్యార్థుల ఫోటో షూట్ పూర్తి చేయండి.",
  },
  {
    text: "విద్యార్థి హాజరు కాకపోతే తల్లిదండ్రులను సంప్రదించి ఫోటో పంపమని అడగండి, అప్‌లోడ్ చేయండి. విద్యార్థి school కి వచ్చినప్పుడు కూడా ఫోటో తీయవచ్చు.",
  },
];

const HI: InstructionStep[] = [
  { text: "अच्छी रोशनी में स्पष्ट और सही फ़ोटो लें।" },
  { text: "छात्र का सही डेटा अपलोड करें।" },
  { text: "सही टेम्पलेट और मॉडल चुनें।" },
  { text: "लोगो, हस्ताक्षर और अन्य आवश्यक चीज़ें अपलोड करें।" },
  { text: "जमा करने से पहले सभी विवरण जाँचें।" },
  { text: "ID कार्ड दिए गए डेटा के अनुसार ही छपेंगे।" },
  { text: "अंतिम जमा के बाद बदलाव की अनुमति नहीं है।" },
  { text: "किसी भी सहायता के लिए सपोर्ट से संपर्क करें।" },
  { text: "इस ऐप का उपयोग केवल अधिकृत उद्देश्य के लिए करें।" },
  { text: "सर्वोत्तम परिणाम के लिए उपरोक्त सभी चरणों का पालन करें।" },
  {
    text: "यह ऐप केवल Android फ़ोन पर चलता है। iPhone (iOS) पर काम नहीं करता।",
  },
  {
    text: "प्रिंसिपल या एडमिन की अनुमति के बिना अपना यूज़रनेम और पासवर्ड किसी के साथ साझा न करें।",
  },
  {
    text: "एडमिन से नमूना छात्र फ़ोटो माँगें। नमूने को ध्यान से देखें और उसी तरह फ़ोटो लें।",
  },
  {
    text: "छात्र पूरा यूनिफ़ॉर्म पहने और कैमरे की ओर सीधा देखे। सीधे खड़े रहें; चश्मा या टोपी न पहनें। आँखें बंद, किनारे देखना या अधिक मुस्कान न हो।",
  },
  {
    text: "पृष्ठभूमि एक ही रंग की हो। फ़ोटो लेने के बाद जाँचें; अच्छी हो तो अपलोड करें, नहीं तो दोबारा लें।",
  },
  {
    text: "सिर के ऊपर और कंधों दोनों ओर थोड़ी जगह छोड़ें। फ़ोटो पेट तक ही लें।",
  },
  {
    text: "दिया गया यूज़रनेम और पासवर्ड केवल 5 कार्य दिवसों तक चलेगा। इस अवधि में सभी छात्रों की फ़ोटो शूट पूरी करें।",
  },
  {
    text: "छात्र अनुपस्थित हो तो अभिभावक से संपर्क करके फ़ोटो मँगवाएँ और अपलोड करें; या स्कूल आने पर फ़ोटो लें।",
  },
];

export const INSTRUCTIONS_BY_LANG: Record<InstructionLang, InstructionStep[]> = {
  te: TE,
  en: EN,
  hi: HI,
};

export const DEFAULT_INSTRUCTION_LANG: InstructionLang = "te";
