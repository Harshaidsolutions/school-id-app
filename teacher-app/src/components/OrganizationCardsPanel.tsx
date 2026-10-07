import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StudentGridCell } from "./StudentGridCell";
import { spacing, radius } from "../theme/colors";
import { greetingForNow } from "../utils/greeting";
import { KeyboardAwareFormScrollView } from "./KeyboardAwareFormScrollView";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
import { IdCardsGreenHeader } from "./IdCardsGreenHeader";
import { IdCardsProgressSection } from "./IdCardsProgressSection";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, BackHandler, FlatList, Image, Linking, Modal, ScrollView, Share, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Pressable } from "./Pressable";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { fonts } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { openWhatsAppShare } from "../utils/whatsappBusiness";

type Field = { id: string; field_name: string; field_type: string; required?: boolean; enabled?: boolean };
type Submission = {
  id: string;
  serial: number;
  photoNumber?: string;
  updatedAt?: string;
  capturedAt?: string | null;
  values: Record<string, { text: string | null; hasPhoto: boolean; capturedAt?: string | null }>;
};
type CardTab = "all" | "pending" | "captured" | "pending-data";

export function OrganizationCardsPanel() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [groupOpen, setGroupOpen] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const loadingRef = useRef(false);
  const { user } = useAuth();
  const [name, setName] = useState(user?.username ?? "Organization");
  const [link, setLink] = useState<string | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [rows, setRows] = useState<Submission[]>([]);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [details, setDetails] = useState({ phone: "", address: "", instructions: "" });
  const [tab, setTab] = useState<CardTab>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [categoryValue, setCategoryValue] = useState("");
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { data } = await api.get<{
        organizationName: string;
        link: string | null;
        fields: Field[];
        submissions: Submission[];
        phone?: string | null;
        address?: string | null;
        instructions?: string | null;
        fieldVisibility?: Record<string, boolean>;
      }>("/organization-app");
      setName(data.organizationName);
      setLink(data.link);
      setFields((data.fields ?? []).filter(field => field.enabled !== false));
      setRows(data.submissions ?? []);
      setVisibility(data.fieldVisibility ?? {});
      setDetails({
        phone: data.phone ?? "",
        address: data.address ?? "",
        instructions: data.instructions ?? "",
      });
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Could not load organization records."));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    const timer = setInterval(() => {
      if (AppState.currentState === "active" && !editingId && !viewerId) void load();
    }, 10000);
    return () => clearInterval(timer);
  }, [load, editingId, viewerId]));

  useEffect(() => { if (visibility.show_captured_section === false && tab === "captured") setTab("all"); }, [visibility, tab]);

  const photoFields = fields.filter((field) => field.field_type === "photo" && !/signature/i.test(field.field_name));
  const textFields = fields.filter((field) => field.field_type !== "photo" && !isLockedPhotoNumber(field.field_name));
  const categoryField = fields.find((field) => field.field_type !== "photo" && isCategoryLabel(field.field_name));
  function captured(row: Submission) {
    return photoFields.length > 0 && photoFields.every((field) => row.values[field.id]?.hasPhoto);
  }
  function missingData(row: Submission) {
    return textFields.some((field) => field.required !== false && !(row.values[field.id]?.text ?? "").trim());
  }
  const categoryOptions = categoryField
    ? [...new Set(rows.map((row) => (row.values[categoryField.id]?.text ?? "").trim()).filter(Boolean))].sort()
    : [];
  const visible = rows.filter((row) => {
    if (tab === "captured" && !captured(row)) return false;
    if (tab === "pending" && captured(row)) return false;
    if (tab === "pending-data" && !missingData(row)) return false;
    if (categoryField && categoryValue && (row.values[categoryField.id]?.text ?? "").trim() !== categoryValue) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (row.photoNumber ?? "").toLowerCase().includes(query) || fields.some((field) => (row.values[field.id]?.text ?? "").toLowerCase().includes(query));
  });
  const counts = {
    all: rows.length,
    pending: rows.filter((row) => !captured(row)).length,
    captured: rows.filter((row) => captured(row)).length,
    pendingData: rows.filter((row) => missingData(row)).length,
  };
  const showDetails = visibility.required_details !== false;

  const groupRows = rows.filter(row => !categoryField || !categoryValue || (row.values[categoryField.id]?.text ?? "").trim() === categoryValue);
  const viewerIndex = visible.findIndex(row => row.id === viewerId);
  const current = visible[viewerIndex];
  const nameField = textFields.find(field => /name/i.test(field.field_name)) ?? textFields[0];
  const recordName = (row: Submission) => (nameField && row.values[nameField.id]?.text) || row.photoNumber || `Record ${row.serial}`;
  const cardWidth = Math.max(100, (width - spacing.pagePad * 2 - spacing.cardGap) / 2);
  const textStyle = {color:colors.text, fontFamily:fonts.medium};
  function closeViewer() { if (!saving) {setViewerId(null);setEditingId(null);setViewPhoto(null);setError(null);} }
  function back() { if (groupOpen) {setGroupOpen(false);setCategoryValue("");setTab("all");setSearch("");} else navigation.navigate("Home" as never); }
  useFocusEffect(useCallback(() => {
    const handler = BackHandler.addEventListener("hardwareBackPress", () => { if (!groupOpen) return false;setGroupOpen(false);setCategoryValue("");setTab("all");setSearch("");return true; });
    return () => handler.remove();
  }, [groupOpen]));
  function beginEdit(row: Submission) {
    const next: Record<string,string> = {};
    textFields.forEach(field => {next[field.id] = row.values[field.id]?.text ?? "";});
    setDraft(next);setEditingId(row.id);setError(null);
  }
  async function saveRecord() {
    if (!current || saving) return;
    const required = textFields.find(field => field.required !== false && !draft[field.id]?.trim());
    if (required) {setError(`${required.field_name} is required.`);return;}
    setSaving(true);
    try {await api.patch(`/organization-app/submissions/${current.id}`, {values:draft});await load();setEditingId(null);}
    catch(err) {setError(getErrorMessage(err,"Could not save this record."));}
    finally {setSaving(false);}
  }
  const actionStyle = {padding:14,borderRadius:radius.lg,backgroundColor:colors.brandGreen,alignItems:"center" as const};
  const headerAction = link ? <Pressable accessibilityLabel="Add record using organization form" style={{backgroundColor:"#fff",borderRadius:radius.full,padding:10}} onPress={() => void Linking.openURL(link).catch(() => setError("Could not open the form link."))}><Text style={{color:colors.brandGreen,fontFamily:fonts.semiBold}}>＋ Add Record</Text></Pressable> : null;
  const tabs = ([["all","All"],["pending","Pending"],["captured","Captured"],["pending-data","Pending Data"]] as const).filter(([key]) => key !== "captured" || visibility.show_captured_section !== false);
  return (
    <View style={{flex:1,backgroundColor:colors.background}}>
      <IdCardsGreenHeader>
        <View style={{flexDirection:"row",alignItems:"center",gap:12}}>
          <Pressable onPress={back} accessibilityLabel="Back" hitSlop={12}><Ionicons name="arrow-back" size={24} color="#fff" /></Pressable>
          <View style={{flex:1}}><Text numberOfLines={1} style={{fontFamily:fonts.bold,fontSize:22,color:"#fff"}}>{groupOpen ? categoryValue || "All Records" : name}</Text>
            {!groupOpen && <Text style={{color:"#fff",fontSize:16}}>{greetingForNow()} Sir/Madam</Text>}</View>
          {groupOpen ? headerAction : <Pressable accessibilityLabel="Organization options" onPress={() => setMenuOpen(true)} hitSlop={12}><Ionicons name="ellipsis-vertical" color="#fff" size={24}/></Pressable>}
        </View>
      </IdCardsGreenHeader>
      <IdCardsProgressSection total={groupOpen ? groupRows.length : counts.all} captured={groupOpen ? groupRows.filter(captured).length : counts.captured}/>
      {!groupOpen ? <ScrollView contentContainerStyle={{padding:spacing.pagePad,gap:14,paddingBottom:insets.bottom+32}}>
        <Text style={{color:colors.brandGreen,fontSize:21,fontFamily:fonts.bold}}>Select {categoryField?.field_name || "Records"}</Text>
        {["",...categoryOptions].map(category => {
          const members = category && categoryField ? rows.filter(row => (row.values[categoryField.id]?.text ?? "").trim() === category) : rows;
          const total = members.length, done = members.filter(captured).length;
          return <Pressable key={category || "all"} onPress={() => {setCategoryValue(category);setGroupOpen(true);}} style={{padding:18,borderWidth:1,borderColor:colors.greenSoft,borderRadius:24,backgroundColor:colors.surface,gap:14}}>
            <View style={{flexDirection:"row",alignItems:"center",gap:8}}><Text style={{...textStyle,flex:1,fontFamily:fonts.bold,fontSize:20}}>{category || "All Records"}</Text><Text style={{color:colors.textMuted}}>{total} Records</Text><Ionicons name="chevron-forward" size={22} color={colors.brandGreen}/></View>
            <View style={{height:8,borderRadius:4,backgroundColor:colors.track,overflow:"hidden"}}><View style={{height:8,width:`${total ? done/total*100 : 0}%`,backgroundColor:colors.brandGreen}}/></View>
            <Text style={{color:colors.textMuted,fontSize:16}}>{done} / {total} Photos</Text>
          </Pressable>;
        })}
        {loading && <Text style={textStyle}>Loading…</Text>}
        {error && <Text style={{color:colors.danger}}>{error}</Text>}
        <Pressable onPress={() => void load()}><Text style={{color:colors.brandGreen}}>Refresh</Text></Pressable>
      </ScrollView> : <>
        <View style={{paddingHorizontal:spacing.pagePad,gap:8,paddingBottom:8}}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{tabs.map(([key,label]) => {
            const count = groupRows.filter(row => key === "all" || (key === "captured" ? captured(row) : key === "pending" ? !captured(row) : missingData(row))).length;
            return <Pressable key={key} onPress={() => {setTab(key);setSearch("");}} style={{paddingHorizontal:16,paddingVertical:10,borderRadius:radius.full,backgroundColor:tab === key ? colors.brandGreen : colors.graySoft}}><Text style={{fontFamily:fonts.semiBold,color:tab===key?"#fff":colors.textMuted}}>{label} ({count})</Text></Pressable>;
          })}</ScrollView>
          <TextInput accessibilityLabel="Search records" placeholder="Search records" placeholderTextColor={colors.textMuted} value={search} onChangeText={setSearch} style={{...textStyle,padding:10,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface}}/>
        </View>
        <FlatList data={visible} numColumns={2} keyExtractor={row => row.id} columnWrapperStyle={{gap:spacing.cardGap}} contentContainerStyle={{paddingHorizontal:spacing.pagePad,gap:spacing.cardGap,paddingBottom:32+insets.bottom}}
          refreshing={loading} onRefresh={() => {setLoading(true);void load();}}
          ListEmptyComponent={<Text style={{...textStyle,textAlign:"center",padding:20}}>{error || "No records in this section."}</Text>}
          renderItem={({item:row}) => <OrganizationGridCell row={row} field={photoFields[0]} width={cardWidth} name={recordName(row)} onPress={() => {setViewerId(row.id);setError(null);}}/>}/>
      </>}
      <Modal visible={Boolean(current)} animationType="slide" onRequestClose={closeViewer}>
        <View style={{flex:1,backgroundColor:colors.background,paddingTop:insets.top,paddingBottom:insets.bottom}}>
          <View style={{padding:16,flexDirection:"row",alignItems:"center"}}><Pressable disabled={saving} onPress={closeViewer} accessibilityLabel="Close record"><Ionicons name="close" size={28} color={colors.text}/></Pressable><Text style={{flex:1,textAlign:"center",color:colors.textMuted,fontSize:18}}>{editingId ? "Edit Record" : `${viewerIndex+1} / ${visible.length}`}</Text></View>
          {current && <KeyboardAwareFormScrollView contentContainerStyle={{padding:16,gap:18,paddingBottom:30}} keyboardShouldPersistTaps="handled">
            {photoFields[0] && current.values[photoFields[0].id]?.hasPhoto ? <SubmissionPhoto submissionId={current.id} fieldId={photoFields[0].id} version={current.capturedAt} large onOpen={setViewPhoto}/> : <View style={{height:280,backgroundColor:colors.graySoft,borderRadius:16,alignItems:"center",justifyContent:"center"}}><Ionicons name="person" size={48} color={colors.textSubtle}/><Text style={{color:colors.textMuted}}>No photo on file</Text></View>}
            <Text style={{...textStyle,fontFamily:fonts.bold,fontSize:24,textAlign:"center"}}>{recordName(current)}</Text>
            {error && <Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text>}
            <View style={{backgroundColor:colors.surface,borderRadius:20,padding:18,gap:18}}>
              <View><Text style={{color:colors.textMuted}}>Photo Number</Text><Text style={{...textStyle,fontSize:17}}>{current.photoNumber || "—"}</Text></View>
              {fields.filter(field => !isLockedPhotoNumber(field.field_name)).map(field => <View key={field.id} style={{gap:6}}>
                <Text style={{color:colors.textMuted,fontFamily:fonts.semiBold}}>{field.field_name}{editingId && field.required !== false ? " *" : ""}</Text>
                {field.field_type === "photo" ? current.values[field.id]?.hasPhoto ? <SubmissionPhoto submissionId={current.id} fieldId={field.id} version={current.values[field.id]?.capturedAt} onOpen={setViewPhoto}/> : <Text style={textStyle}>No photo on file</Text> : editingId ? <TextInput accessibilityLabel={field.field_name} value={draft[field.id] ?? ""} onChangeText={value => setDraft(old => ({...old,[field.id]:value}))} style={{...textStyle,borderWidth:1,borderColor:colors.border,borderRadius:12,padding:12}}/> : <Text style={{...textStyle,fontSize:17}}>{current.values[field.id]?.text || "—"}</Text>}
              </View>)}
            </View>
          </KeyboardAwareFormScrollView>}
          <View style={{flexDirection:"row",padding:12,gap:10}}>
            {editingId ? <><Pressable disabled={saving} onPress={() => {setEditingId(null);setError(null);}} style={{...actionStyle,flex:1,backgroundColor:colors.graySoft}}><Text style={textStyle}>Cancel</Text></Pressable><Pressable disabled={saving} onPress={() => void saveRecord()} style={{...actionStyle,flex:1}}><Text style={{color:"#fff",fontFamily:fonts.bold}}>{saving ? "Saving…" : "Save"}</Text></Pressable></> : <>
              <Pressable disabled={viewerIndex<=0} onPress={() => setViewerId(visible[viewerIndex-1].id)} style={{...actionStyle,flex:1,opacity:viewerIndex<=0?.4:1}}><Text style={{color:"#fff"}}>← Back</Text></Pressable>
              {current && (visibility.allow_record_edit !== false || missingData(current)) && <Pressable onPress={() => beginEdit(current)} style={{...actionStyle,flex:1,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.brandGreen}}><Text style={{color:colors.brandGreen,fontFamily:fonts.bold}}>Edit Form</Text></Pressable>}
              <Pressable disabled={viewerIndex>=visible.length-1} onPress={() => setViewerId(visible[viewerIndex+1].id)} style={{...actionStyle,flex:1,opacity:viewerIndex>=visible.length-1?.4:1}}><Text style={{color:"#fff"}}>Next →</Text></Pressable>
            </>}
          </View>
          {viewPhoto && <Pressable accessibilityLabel="Close photo" onPress={() => setViewPhoto(null)} style={{position:"absolute",inset:0,backgroundColor:"#fff",justifyContent:"center",padding:16}}><Image source={{uri:viewPhoto}} style={{width:"100%",height:"80%"}} resizeMode="contain"/><Text style={textStyle}>Close photo</Text></Pressable>}
        </View>
      </Modal>
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}><Pressable onPress={() => setMenuOpen(false)} style={{flex:1,backgroundColor:"rgba(20,20,50,.4)",justifyContent:"center",padding:24}}><View style={{padding:20,gap:20,backgroundColor:colors.surface,borderRadius:20}}>
        {showDetails && <Pressable onPress={() => {setMenuOpen(false);navigation.navigate("OrganizationDetails");}}><Text style={textStyle}>Required Details</Text></Pressable>}
        {link && <Pressable onPress={() => {setMenuOpen(false);void openWhatsAppShare(link).catch(() => Share.share({message:link,url:link}));}}><Text style={textStyle}>Share Form Link</Text></Pressable>}
        <Pressable onPress={() => setMenuOpen(false)}><Text style={textStyle}>Close</Text></Pressable>
      </View></Pressable></Modal>
    </View>
  );
}

function OrganizationGridCell({row,field,width,name,onPress}:{row:Submission;field?:Field;width:number;name:string;onPress:()=>void}) {
  const {colors} = useTheme();
  const uri = useSubmissionPhoto(row.id,field?.id,row.values[field?.id ?? ""]?.hasPhoto === true,row.values[field?.id ?? ""]?.capturedAt);
  return <StudentGridCell width={width} colors={colors} captured={Boolean(row.values[field?.id ?? ""]?.hasPhoto)} onPress={onPress} item={{id:row.id,student_name:name,roll_no:null,photo_url:uri,status:null,photo_captured_at:row.capturedAt}}/>;
}

function isLockedPhotoNumber(name: string): boolean {
  return /photo\s*(number|no\.?|id)\b/i.test(name);
}

function isCategoryLabel(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (
    normalized.includes("department") ||
    normalized.includes("designation") ||
    normalized.includes("group") ||
    normalized === "class" ||
    normalized.includes("classsection") ||
    normalized.includes("section") ||
    normalized.includes("grade")
  );
}

function useSubmissionPhoto(submissionId: string, fieldId?: string, hasPhoto = true, version?: string | null) {
  const [uri,setUri] = useState<string|null>(null);
  useEffect(() => {
    let cancelled = false;setUri(null);
    if (fieldId && hasPhoto) void api.get<ArrayBuffer>(`/organization-app/submissions/${submissionId}/fields/${fieldId}/photo`, {responseType:"arraybuffer",params:{v:version}}).then(({data}) => {if(!cancelled)setUri(`data:image/jpeg;base64,${toBase64(data)}`);}).catch(() => {if(!cancelled)setUri(null);});
    return () => {cancelled=true;};
  },[submissionId,fieldId,hasPhoto,version]);
  return uri;
}
function SubmissionPhoto({submissionId,fieldId,onOpen,large=false,version}:{submissionId:string;fieldId:string;onOpen?:(uri:string)=>void;large?:boolean;version?:string|null}) {
  const uri=useSubmissionPhoto(submissionId,fieldId,true,version);
  const {colors}=useTheme();
  return <Pressable accessibilityLabel="View photo" onPress={() => uri && onOpen?.(uri)} style={{height:large?280:90,width:large?"100%":90,backgroundColor:colors.graySoft,borderRadius:14,overflow:"hidden"}}>{uri?<Image source={{uri}} style={{width:"100%",height:"100%"}} resizeMode="contain"/>:<Text style={{color:colors.textMuted,padding:10}}>Loading photo…</Text>}</Pressable>;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return globalThis.btoa(binary);
}
