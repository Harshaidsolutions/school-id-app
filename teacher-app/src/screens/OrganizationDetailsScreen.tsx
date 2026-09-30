import { useCallback, useEffect, useMemo, useRef, useState, memo, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import api, { getErrorMessage } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useFormConfig } from "../hooks/useFormConfig";
import { ErrorRetry, LoadingBlock } from "../components/ErrorRetry";
import { IconChip } from "../components/IconChip";
import { OrangeGradientHeader } from "../components/OrangeGradientHeader";
import { SectionHeader } from "../components/SectionHeader";
import { useToast } from "../components/Toast";
import type { RootStackParamList } from "../navigation/types";
import { type TeacherModel, type TemplatesResponse } from "../types";
import { templatePreviewUrl } from "../utils/templateImage";
import {
  modelImageUrl,
  modelImageUrlByName,
  modelNameFromPreviewUrl,
} from "../utils/modelImage";
import { resolveMediaUrl } from "../utils/mediaUrl";
import { toImageUri } from "../utils/imageSource";
import { clearOrgFormCleared } from "../utils/orgDetailsStorage";
import { applyOrgSchoolFromServer } from "../utils/applyOrgDetailsDraft";
import {
  persistOrgDetailsImage,
  resolveUploadFile,
} from "../utils/orgDetailsLocalImage";
import { clearOrgDetailsDraft } from "../utils/orgDetailsDraft";
import { cardShadow, radius, spacing } from "../theme/colors";
import { fonts, textStyles, type as typeScale } from "../theme/typography";
import { useTheme } from "../theme/ThemeContext";
import { useResponsiveLayout } from "../hooks/useResponsiveLayout";
import { useResponsiveStyles } from "../hooks/useResponsiveStyles";
import { SubmitGradientButton } from "../components/SubmitGradientButton";
import { Pressable } from "../components/Pressable";
import type { AppColors } from "../theme/palettes";


type Props = NativeStackScreenProps<RootStackParamList, "OrganizationDetails">;

type OrgSchool = {
  id: string;
  name: string;
  phone: string | null;
  phone2: string | null;
  school_code: string | null;
  establish_year: string | null;
  year?: string | null;
  address: string | null;
  instructions: string | null;
  logo_url: string | null;
  signature_url: string | null;
  organization_photo_url: string | null;
  model: string | null;
  tags: string | null;
  template_id: string | null;
};

type OrgTemplate = { id: string; name: string; orientation: string | null };
type LocalImage = { uri: string; name: string; type: string };
type UploadKind = "signature" | "logo" | "organization";

type OrgFormSnapshot = {
  phone: string;
  phone2: string;
  schoolCode: string;
  establishYear: string;
  address: string;
  instructions: string;
  model: string;
  tags: string;
  templateId: string | null;
  signatureUri: string | null;
  logoUri: string | null;
  orgPhotoUri: string | null;
};

function baselineFromSchool(row: OrgSchool): OrgFormSnapshot {
  return {
    phone: row.phone?.trim() ?? "",
    phone2: row.phone2?.trim() ?? "",
    schoolCode: row.school_code?.trim() ?? "",
    establishYear: (row.establish_year ?? row.year ?? "").trim(),
    address: row.address?.trim() ?? "",
    instructions: row.instructions?.trim() ?? "",
    model: row.model?.trim() ?? "",
    tags: row.tags?.trim() ?? "",
    templateId: row.template_id,
    signatureUri: toImageUri(row.signature_url),
    logoUri: toImageUri(row.logo_url),
    orgPhotoUri: toImageUri(row.organization_photo_url),
  };
}

function orgUploadImageUri(
  uri: string | null,
  orgId: string,
  field: string
): string | null {
  if (!uri) return null;
  if (!orgId || uri.startsWith("file:") || uri.startsWith("content:")) {
    return uri;
  }
  const sep = uri.includes("?") ? "&" : "?";
  return `${uri}${sep}org=${encodeURIComponent(orgId)}&field=${field}&v=${encodeURIComponent(uri)}`;
}

function snapshotsEqual(a: OrgFormSnapshot, b: OrgFormSnapshot): boolean {
  return (
    a.phone === b.phone &&
    a.phone2 === b.phone2 &&
    a.schoolCode === b.schoolCode &&
    a.establishYear === b.establishYear &&
    a.address === b.address &&
    a.instructions === b.instructions &&
    a.model === b.model &&
    a.tags === b.tags &&
    a.templateId === b.templateId &&
    a.signatureUri === b.signatureUri &&
    a.logoUri === b.logoUri &&
    a.orgPhotoUri === b.orgPhotoUri
  );
}

export function OrganizationDetailsScreen({ navigation, route }: Props) {
  const styles = useOrgDetailsStyles();
  const { scale } = useResponsiveLayout();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const { colors } = useTheme();
  const { fieldVisibility } = useFormConfig();
  const showDetail = (key: string) => fieldVisibility[key] !== false;
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<UploadKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [school, setSchool] = useState<OrgSchool | null>(null);
  const [templates, setTemplates] = useState<OrgTemplate[]>([]);
  const [templateImages, setTemplateImages] = useState<Record<string, string>>({});

  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [schoolCode, setSchoolCode] = useState("");
  const [establishYear, setEstablishYear] = useState("");
  const [address, setAddress] = useState("");
  const [instructions, setInstructions] = useState("");
  const [model, setModel] = useState("");
  const [tags, setTags] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);

  const [logoUri, setLogoUri] = useState<string | null>(null);
  const [signatureUri, setSignatureUri] = useState<string | null>(null);
  const [orgPhotoUri, setOrgPhotoUri] = useState<string | null>(null);
  const [catalogModels, setCatalogModels] = useState<TeacherModel[]>([]);
  const [modelPreviewUrl, setModelPreviewUrl] = useState<string | null>(null);
  const [tagsPreviewUrl, setTagsPreviewUrl] = useState<string | null>(null);
  const [templatePreviewUrlState, setTemplatePreviewUrlState] = useState<string | null>(null);
  const [confirmSubmitOpen, setConfirmSubmitOpen] = useState(false);
  const [schoolInfoEditing, setSchoolInfoEditing] = useState(true);
  const templateImagesRef = useRef<Record<string, string>>({});
  const hasLoadedRef = useRef(false);
  const pickerActiveRef = useRef(false);
  const skipServerHydrateRef = useRef(false);
  const [savedBaseline, setSavedBaseline] = useState<OrgFormSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingSignature, setPendingSignature] = useState<LocalImage | null>(null);
  const [pendingLogo, setPendingLogo] = useState<LocalImage | null>(null);
  const [pendingOrgPhoto, setPendingOrgPhoto] = useState<LocalImage | null>(null);

  const selectedTemplateUri = useMemo(() => {
    if (templateId && templateImages[templateId]) {
      return toImageUri(templateImages[templateId]);
    }
    if (templatePreviewUrlState) return toImageUri(templatePreviewUrlState);
    return null;
  }, [templatePreviewUrlState, templateId, templateImages]);
  const selectedModelUri = useMemo(() => {
    if (model.trim()) {
      const fromCatalog = modelImageUrlByName(model, catalogModels);
      if (fromCatalog) return toImageUri(fromCatalog);
    }
    if (modelPreviewUrl) return toImageUri(modelPreviewUrl);
    return null;
  }, [modelPreviewUrl, model, catalogModels]);
  const selectedTagPreviews = useMemo(() => {
    const fromNames = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((name) => modelImageUrlByName(name, catalogModels))
      .filter((uri): uri is string => Boolean(uri));
    if (fromNames.length > 0) return fromNames;
    if (tagsPreviewUrl) {
      const uri = toImageUri(tagsPreviewUrl);
      return uri ? [uri] : [];
    }
    return [];
  }, [catalogModels, tags, tagsPreviewUrl]);

  const hasSavedSchoolInfo = useMemo(() => {
    const row = school;
    if (!row) return false;
    const year = row.establish_year ?? row.year ?? "";
    const phoneOk = fieldVisibility.detail_phone === false || Boolean(row.phone?.trim());
    const addressOk = fieldVisibility.detail_address === false || Boolean(row.address?.trim());
    const yearOk = fieldVisibility.detail_year === false || Boolean(year.trim());
    return phoneOk && addressOk && yearOk;
  }, [fieldVisibility, school]);

  const currentSnapshot = useMemo(
    (): OrgFormSnapshot => ({
      phone: phone.trim(),
      phone2: phone2.trim(),
      schoolCode: schoolCode.trim(),
      establishYear: establishYear.trim(),
      address: address.trim(),
      instructions: instructions.trim(),
      model: model.trim(),
      tags: tags.trim(),
      templateId,
      signatureUri,
      logoUri,
      orgPhotoUri,
    }),
    [
      phone,
      phone2,
      schoolCode,
      establishYear,
      address,
      instructions,
      model,
      tags,
      templateId,
      signatureUri,
      logoUri,
      orgPhotoUri,
    ]
  );

  const isDirty = useMemo(() => {
    if (pendingSignature || pendingLogo || pendingOrgPhoto) return true;
    if (!savedBaseline) return false;
    return !snapshotsEqual(currentSnapshot, savedBaseline);
  }, [currentSnapshot, pendingSignature, pendingLogo, pendingOrgPhoto, savedBaseline]);

  const refreshCatalogImages = useCallback(async () => {
    try {
      const [modelRes, templateRes] = await Promise.all([
        api.get<{ models: TeacherModel[]; tags?: TeacherModel[] }>("/teacher/models"),
        api.get<TemplatesResponse>("/teacher/templates"),
      ]);
      const models = [...(modelRes.data.models ?? []), ...(modelRes.data.tags ?? [])].map((m) => ({
        ...m,
        image_url: modelImageUrl(m),
      }));
      setCatalogModels(models);
      const imgs: Record<string, string> = {};
      for (const t of templateRes.data.templates ?? []) {
        const url = templatePreviewUrl(t);
        if (url) imgs[t.id] = url;
      }
      templateImagesRef.current = imgs;
      setTemplateImages(imgs);
      return { imgs, models };
    } catch {
      setCatalogModels([]);
      templateImagesRef.current = {};
      setTemplateImages({});
      return { imgs: {} as Record<string, string>, models: [] as TeacherModel[] };
    }
  }, []);

  const load = useCallback(
    async (options?: { pullRefresh?: boolean }) => {
      if (!userId) return;
      const blocking = !hasLoadedRef.current;
      if (blocking) {
        setLoading(true);
        setError(null);
      }
      if (options?.pullRefresh) {
        setRefreshing(true);
        skipServerHydrateRef.current = false;
      }

      try {
        const { data } = await api.get<{
          school: OrgSchool;
          templates: OrgTemplate[];
        }>("/teacher/organization");
        setTemplates(data.templates ?? []);
        const { imgs, models } = await refreshCatalogImages();

        setSchool(data.school);
        setSavedBaseline(baselineFromSchool(data.school));

        if (!skipServerHydrateRef.current || options?.pullRefresh) {
          applyOrgSchoolFromServer(
            data.school,
            imgs,
            models,
            {
              setSignatureUri,
              setLogoUri,
              setOrgPhotoUri,
              setPendingSignature,
              setPendingLogo,
              setPendingOrgPhoto,
              setTemplateId,
              setTemplatePreviewUrlState,
              setModel,
              setTags,
              setModelPreviewUrl,
              setTagsPreviewUrl,
              setPhone,
              setPhone2,
              setSchoolCode,
              setEstablishYear,
              setAddress,
              setInstructions,
            },
            toImageUri
          );
        }

        if (userId) {
          await clearOrgDetailsDraft(userId);
        }

        if (userId) {
          await clearOrgFormCleared(userId);
        }
      } catch (err) {
        if (blocking) {
          setError(getErrorMessage(err, "Failed to load organization details."));
        }
      } finally {
        hasLoadedRef.current = true;
        if (blocking) setLoading(false);
        if (options?.pullRefresh) setRefreshing(false);
      }
    },
    [refreshCatalogImages, userId]
  );

  useEffect(() => {
    const phoneReady = !showDetail("detail_phone") || Boolean(phone.trim());
    const addressReady = !showDetail("detail_address") || Boolean(address.trim());
    const yearReady = !showDetail("detail_year") || Boolean(establishYear.trim());
    if (hasSavedSchoolInfo && phoneReady && addressReady && yearReady) {
      setSchoolInfoEditing(false);
    }
  }, [address, establishYear, fieldVisibility, hasSavedSchoolInfo, phone]);

  const applyPendingRouteParams = useCallback(() => {
    if (pickerActiveRef.current) {
      pickerActiveRef.current = false;
      return;
    }
    const pendingTemplate = route.params?.pendingTemplatePreviewUrl;
    const pendingTemplateId = route.params?.pendingTemplateId;
    const pendingModel = route.params?.pendingModelPreviewUrl;
    const pendingTags = route.params?.pendingTagsPreviewUrl;
    const pendingModelName = route.params?.pendingModelName;
    const pendingTagsName = route.params?.pendingTagsName;

    const hasPending =
      pendingTemplate ||
      pendingTemplateId ||
      pendingModel ||
      pendingTags ||
      pendingModelName ||
      pendingTagsName;

    if (!hasPending) return;

    if (pendingTemplateId) {
      setTemplateId(pendingTemplateId);
      const catalogUrl = templateImagesRef.current[pendingTemplateId];
      if (catalogUrl) {
        setTemplatePreviewUrlState(catalogUrl);
      }
    }
    if (pendingTemplate) {
      setTemplatePreviewUrlState(toImageUri(pendingTemplate) ?? pendingTemplate);
    }
    if (pendingModelName) {
      setModel(pendingModelName);
      const url = modelImageUrlByName(pendingModelName, catalogModels);
      if (url) {
        setModelPreviewUrl(url);
      }
    }
    if (pendingTagsName) {
      setTags(pendingTagsName);
      const url = modelImageUrlByName(pendingTagsName, catalogModels);
      if (url) {
        setTagsPreviewUrl(url);
      }
    }
    if (pendingModel) {
      setModelPreviewUrl(toImageUri(pendingModel) ?? pendingModel);
    }
    if (pendingTags) {
      setTagsPreviewUrl(toImageUri(pendingTags) ?? pendingTags);
    }

    navigation.setParams({
      pendingTemplatePreviewUrl: undefined,
      pendingTemplateId: undefined,
      pendingModelPreviewUrl: undefined,
      pendingTagsPreviewUrl: undefined,
      pendingModelName: undefined,
      pendingTagsName: undefined,
    });
  }, [
    catalogModels,
    model,
    modelPreviewUrl,
    navigation,
    route.params?.pendingModelName,
    route.params?.pendingModelPreviewUrl,
    route.params?.pendingTagsName,
    route.params?.pendingTagsPreviewUrl,
    route.params?.pendingTemplateId,
    route.params?.pendingTemplatePreviewUrl,
    tags,
    tagsPreviewUrl,
    templateId,
    templatePreviewUrlState,
    userId,
  ]);

  useFocusEffect(
    useCallback(() => {
      applyPendingRouteParams();
      if (!userId) return;
      if (pickerActiveRef.current) return;
      skipServerHydrateRef.current = false;
      void load();
    }, [applyPendingRouteParams, load, userId])
  );

  useEffect(() => {
    applyPendingRouteParams();
  }, [applyPendingRouteParams]);

  function validateSchoolInfo(): string | null {
    if (showDetail("detail_phone") && !phone.trim()) return "Phone Number 1 is required.";
    if (
      showDetail("detail_year") &&
      (!establishYear.trim() || !/^\d{4}$/.test(establishYear.trim()))
    ) {
      return "School Establish Year is required (4-digit year).";
    }
    if (showDetail("detail_address") && !address.trim()) return "Full School Address is required.";
    return null;
  }

  function requestSubmitAll() {
    const validationError = validateSchoolInfo();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setConfirmSubmitOpen(true);
  }

  function resolveTemplateIdForSubmit(): string | null {
    if (templateId) return templateId;
    if (!templatePreviewUrlState) return null;
    const preview = toImageUri(templatePreviewUrlState) ?? templatePreviewUrlState;
    for (const [id, url] of Object.entries(templateImages)) {
      const resolved = toImageUri(url) ?? url;
      if (resolved === preview) return id;
    }
    return null;
  }

  async function handleSubmitAll() {
    setConfirmSubmitOpen(false);
    setSaving(true);
    setError(null);
    const wasSaved = hasSavedSchoolInfo;
    try {
      let submitModel = model.trim();
      let submitTags = tags.trim();
      if (!submitModel && modelPreviewUrl) {
        submitModel = modelNameFromPreviewUrl(modelPreviewUrl, catalogModels);
      }
      if (!submitTags && tagsPreviewUrl) {
        submitTags = modelNameFromPreviewUrl(tagsPreviewUrl, catalogModels);
      }
      const submitTemplateId = resolveTemplateIdForSubmit();

      const payload = {
        phone: phone.trim(),
        phone2: phone2.trim(),
        year: establishYear.trim(),
        school_code: schoolCode.trim(),
        address: address.trim(),
        instructions: instructions.trim(),
        model: submitModel,
        tags: submitTags,
        template_id: submitTemplateId ?? "",
      };

      const signatureFile = resolveUploadFile(
        pendingSignature,
        signatureUri,
        "signature.jpg"
      );
      const logoFile = resolveUploadFile(pendingLogo, logoUri, "logo.jpg");
      const orgFile = resolveUploadFile(
        pendingOrgPhoto,
        orgPhotoUri,
        "organization.jpg"
      );
      const hasFiles = Boolean(signatureFile || logoFile || orgFile);

      let savedSchool: OrgSchool;
      if (hasFiles) {
        const form = new FormData();
        for (const [key, value] of Object.entries(payload)) {
          form.append(key, value);
        }
        if (signatureFile) {
          form.append("signature", signatureFile as unknown as Blob);
        }
        if (logoFile) {
          form.append("logo", logoFile as unknown as Blob);
        }
        if (orgFile) {
          form.append("organization", orgFile as unknown as Blob);
        }
        const { data } = await api.put<{ school: OrgSchool }>(
          "/teacher/organization",
          form,
          { transformRequest: (body) => body }
        );
        savedSchool = data.school;
      } else {
        const { data } = await api.put<{ school: OrgSchool }>(
          "/teacher/organization",
          payload
        );
        savedSchool = data.school;
      }

      const { imgs, models } = await refreshCatalogImages();
      setSchool(savedSchool);
      skipServerHydrateRef.current = false;
      applyOrgSchoolFromServer(
        savedSchool,
        imgs,
        models,
        {
          setSignatureUri,
          setLogoUri,
          setOrgPhotoUri,
          setPendingSignature,
          setPendingLogo,
          setPendingOrgPhoto,
          setTemplateId,
          setTemplatePreviewUrlState,
          setModel,
          setTags,
          setModelPreviewUrl,
          setTagsPreviewUrl,
          setPhone,
          setPhone2,
          setSchoolCode,
          setEstablishYear,
          setAddress,
          setInstructions,
        },
        toImageUri
      );
      setSavedBaseline(baselineFromSchool(savedSchool));
      setPendingSignature(null);
      setPendingLogo(null);
      setPendingOrgPhoto(null);
      setSchoolInfoEditing(false);

      if (userId) {
        await clearOrgFormCleared(userId);
        clearOrgDetailsDraft(userId);
      }

      showToast(wasSaved ? "Updated successfully." : "Submitted successfully.");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save."));
    } finally {
      setSaving(false);
    }
  }

  async function uploadOrgImageImmediately(kind: UploadKind, file: LocalImage) {
    setUploading(kind);
    setError(null);
    try {
      const form = new FormData();
      const fieldName =
        kind === "organization" ? "organization" : kind;
      form.append(fieldName, file as unknown as Blob);
      const { data } = await api.put<{ school: OrgSchool }>(
        "/teacher/organization",
        form,
        { transformRequest: (body) => body }
      );
      const row = data.school;
      const { imgs, models } = await refreshCatalogImages();
      setSchool(row);
      skipServerHydrateRef.current = false;
      applyOrgSchoolFromServer(
        row,
        imgs,
        models,
        {
          setSignatureUri,
          setLogoUri,
          setOrgPhotoUri,
          setPendingSignature,
          setPendingLogo,
          setPendingOrgPhoto,
          setTemplateId,
          setTemplatePreviewUrlState,
          setModel,
          setTags,
          setModelPreviewUrl,
          setTagsPreviewUrl,
          setPhone,
          setPhone2,
          setSchoolCode,
          setEstablishYear,
          setAddress,
          setInstructions,
        },
        toImageUri
      );
      setSavedBaseline(baselineFromSchool(row));
      if (userId) {
        clearOrgDetailsDraft(userId);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Failed to upload image."));
    } finally {
      setUploading(null);
    }
  }

  async function pickImage(kind: UploadKind) {
    pickerActiveRef.current = true;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      pickerActiveRef.current = false;
      setError("Photo library permission is required.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
    });
    pickerActiveRef.current = false;
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const uri = asset.uri;
    const storageKind =
      kind === "organization" ? "organization" : kind;
    const file: LocalImage = userId
      ? await persistOrgDetailsImage(uri, userId, storageKind, asset.mimeType)
      : {
          uri,
          name: uri.split("/").pop() ?? `${kind}.jpg`,
          type: asset.mimeType ?? "image/jpeg",
        };
    const preview = toImageUri(file.uri);
    skipServerHydrateRef.current = true;
    if (kind === "logo") {
      setLogoUri(preview);
      setPendingLogo(file);
    } else if (kind === "signature") {
      setSignatureUri(preview);
      setPendingSignature(file);
    } else {
      setOrgPhotoUri(preview);
      setPendingOrgPhoto(file);
    }
    await uploadOrgImageImmediately(kind, file);
  }

  if (loading && !school) return <LoadingBlock label="Loading…" />;
  if (error && !school)
    return <ErrorRetry message={error} onRetry={() => void load()} />;

  const formScroll = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.scroll,
        {
          paddingBottom:
            spacing.xxl + insets.bottom + (isDirty ? scale(76) : 0),
        },
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled={false}
      scrollEventThrottle={16}
      overScrollMode="never"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void load({ pullRefresh: true })}
        />
      }
    >
      <View
        style={[
          styles.card,
          styles.cardSpacing,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >            <SectionHeader title="Upload Details" icon="cloud-upload" chipIndex={0} />

            {showDetail("detail_signature") ? (
            <UploadRow
              colors={colors}
              chipIndex={0}
              icon="create"
              label="Principal Signature"
              sublabel="Upload principal signature"
              uri={orgUploadImageUri(signatureUri, school?.id ?? "", "signature")}
              onPress={() => void pickImage("signature")}
              busy={uploading === "signature"}
              selectionPreview
            />
            ) : null}
            {showDetail("detail_logo") ? (
            <UploadRow
              colors={colors}
              chipIndex={1}
              icon="shield-checkmark"
              label="School Logo"
              sublabel="Upload school logo"
              uri={orgUploadImageUri(logoUri, school?.id ?? "", "logo")}
              onPress={() => void pickImage("logo")}
              busy={uploading === "logo"}
              selectionPreview
            />
            ) : null}
            {showDetail("detail_organization_photo") ? (
            <UploadRow
              colors={colors}
              chipIndex={2}
              icon="business"
              label="School Building Photo"
              sublabel="Upload school building photo"
              uri={orgUploadImageUri(orgPhotoUri, school?.id ?? "", "organization")}
              onPress={() => void pickImage("organization")}
              busy={uploading === "organization"}
              selectionPreview
            />
            ) : null}
            {showDetail("detail_template") ? (
            <UploadRow
              colors={colors}
              chipIndex={3}
              icon="document-text"
              label="Select Template"
              sublabel={
                templates.find((t) => t.id === templateId)?.name ??
                "Choose a template"
              }
              uri={selectedTemplateUri}
              isSelected={Boolean(selectedTemplateUri || templateId)}
              onPress={() => {
                navigation.navigate("MainTabs" as any, {
                  screen: "Template",
                  params: { returnToOrgDetails: true },
                });
              }}
              showChevron
              actionLabel="Select"
              selectionPreview
            />
            ) : null}
            {showDetail("detail_model") ? (
            <UploadRow
              colors={colors}
              chipIndex={4}
              icon="cube"
              label="Select Model"
              sublabel={model || "Choose a model"}
              uri={selectedModelUri}
              isSelected={Boolean(selectedModelUri || model.trim())}
              onPress={() => {
                navigation.navigate("MainTabs" as any, {
                  screen: "Models",
                  params: { tab: "id_cards", returnToOrgDetails: true },
                });
              }}
              showChevron
              actionLabel="Select"
              selectionPreview
            />
            ) : null}
            {showDetail("detail_tags") ? (
            <UploadRow
              colors={colors}
              chipIndex={5}
              icon="pricetag"
              label="Select Tags"
              sublabel={tags || "Choose tags"}
              previewUris={selectedTagPreviews}
              isSelected={Boolean(tags.trim())}
              onPress={() => {
                navigation.navigate("MainTabs" as any, {
                  screen: "Models",
                  params: { tab: "tags", returnToOrgDetails: true },
                });
              }}
              showChevron
              actionLabel="Select"
              selectionPreview
              last
            />
            ) : null}
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <SectionHeader title="School Information" icon="school" chipIndex={1} />

            {!schoolInfoEditing && hasSavedSchoolInfo ? (
              <View style={styles.readOnlyBlock}>
                {showDetail("detail_phone") ? (
                  <ReadOnlyField colors={colors} label="Phone Number 1" value={phone} />
                ) : null}
                {showDetail("detail_phone2") ? (
                  <ReadOnlyField colors={colors} label="Phone Number 2" value={phone2 || "—"} />
                ) : null}
                {showDetail("detail_code") ? (
                  <ReadOnlyField colors={colors} label="School Code" value={schoolCode || "—"} />
                ) : null}
                {showDetail("detail_year") ? (
                  <ReadOnlyField colors={colors} label="School Establish Year" value={establishYear} />
                ) : null}
                {showDetail("detail_address") ? (
                  <ReadOnlyField colors={colors} label="Full School Address" value={address} multiline />
                ) : null}
                {showDetail("detail_instructions") ? (
                <ReadOnlyField
                  colors={colors}
                  label="Instructions"
                  value={instructions || "—"}
                  multiline
                  last
                />
                ) : null}
                <Pressable
                  style={[styles.sectionEditBtn, { borderColor: colors.primaryOrange }]}
                  onPress={() => setSchoolInfoEditing(true)}
                >
                  <Ionicons name="create-outline" size={16} color={colors.primaryOrange} />
                  <Text style={[styles.sectionEditText, { color: colors.primaryOrange }]}>
                    Edit
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
            {showDetail("detail_phone") ? (
            <FormField colors={colors} label="Phone Number 1" icon="call" chipIndex={1}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="Enter phone number 1"
                placeholderTextColor={colors.textPlaceholder}
              />
            </FormField>
            ) : null}

            {showDetail("detail_phone2") ? (
            <FormField colors={colors} label="Phone Number 2" icon="call" chipIndex={0}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={phone2}
                onChangeText={setPhone2}
                keyboardType="phone-pad"
                placeholder="Enter phone number 2"
                placeholderTextColor={colors.textPlaceholder}
              />
            </FormField>
            ) : null}

            {showDetail("detail_code") ? (
            <FormField colors={colors} label="School Code" icon="grid" chipIndex={3}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={schoolCode}
                onChangeText={setSchoolCode}
                autoCapitalize="characters"
                placeholder="Enter school code"
                placeholderTextColor={colors.textPlaceholder}
              />
            </FormField>
            ) : null}

            {showDetail("detail_year") ? (
            <FormField
              colors={colors}
              label="School Establish Year"
              icon="calendar"
              chipIndex={0}
            >
              <TextInput
                style={[styles.input, { color: colors.text }]}
                value={establishYear}
                onChangeText={(v) =>
                  setEstablishYear(v.replace(/[^\d]/g, "").slice(0, 4))
                }
                keyboardType="number-pad"
                maxLength={4}
                placeholder="e.g. 2005"
                placeholderTextColor={colors.textPlaceholder}
              />
            </FormField>
            ) : null}

            {showDetail("detail_address") ? (
            <FormField
              colors={colors}
              label="Full School Address"
              icon="location"
              chipIndex={2}
            >
              <TextInput
                style={[styles.input, styles.multiline, { color: colors.text }]}
                value={address}
                onChangeText={setAddress}
                multiline
                placeholder="Enter full school address"
                placeholderTextColor={colors.textPlaceholder}
              />
            </FormField>
            ) : null}

            {showDetail("detail_instructions") ? (
            <FormField
              colors={colors}
              label="Instructions"
              icon="document-text"
              chipIndex={4}
              last
            >
              <TextInput
                style={[
                  styles.input,
                  styles.multilineTall,
                  { color: colors.text },
                ]}
                value={instructions}
                onChangeText={setInstructions}
                multiline
                placeholder="Enter any instructions (Max 1000 characters)"
                placeholderTextColor={colors.textPlaceholder}
                maxLength={1000}
              />
              <Text
                style={[styles.charCount, { color: colors.textPlaceholder }]}
              >
                {instructions.length} / 1000
              </Text>
            </FormField>
            ) : null}
              </>
            )}
          </View>

          {error ? (
            <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
          ) : null}

        </ScrollView>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <OrangeGradientHeader
        title="REQUIRED DETAILS"
        subtitle="Only Principal can Upload this form"
        subtitleLines={1}
        onBack={() => navigation.goBack()}
      />

      {showDetail("required_details") ? (
        Platform.OS === "ios" ? (
          <KeyboardAvoidingView style={styles.flex} behavior="padding">
            {formScroll}
          </KeyboardAvoidingView>
        ) : (
          formScroll
        )
      ) : (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg }}>
          <Text
            style={{ color: colors.text, fontFamily: fonts.semiBold, fontSize: typeScale.body, textAlign: "center" }}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            Please contact the admin to upload required details.
          </Text>
        </View>
      )}

      {isDirty ? (
        <View
          style={[
            styles.stickySubmit,
            {
              paddingBottom: Math.max(insets.bottom, spacing.sm),
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}
        >
          <SubmitGradientButton
            style={styles.submitFull}
            label={hasSavedSchoolInfo ? "Update" : "Submit"}
            onPress={() => requestSubmitAll()}
            disabled={saving || uploading !== null}
            loading={saving}
          />
        </View>
      ) : null}

      <Modal visible={confirmSubmitOpen} transparent animationType="fade">
        <View style={[styles.confirmBackdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.confirmCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>
              {hasSavedSchoolInfo ? "Confirm update" : "Confirm submission"}
            </Text>
            <Text style={[styles.confirmBody, { color: colors.textMuted }]}>
              {hasSavedSchoolInfo
                ? "Are you sure you want to update these details?"
                : "Are you sure you want to submit?"}
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={[styles.confirmCancel, { backgroundColor: colors.graySoft }]}
                onPress={() => setConfirmSubmitOpen(false)}
                disabled={saving}
              >
                <Text style={[styles.confirmCancelText, { color: colors.text }]}>
                  No
                </Text>
              </Pressable>
              <SubmitGradientButton
                style={{ flex: 1 }}
                label="Yes"
                onPress={() => void handleSubmitAll()}
                disabled={saving}
                loading={saving}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const UploadRow = memo(function UploadRow({
  colors,
  chipIndex,
  icon,
  label,
  sublabel,
  uri,
  previewUris,
  onPress,
  showChevron,
  actionLabel = "Upload",
  last,
  thumbSize = "default",
  busy,
  selectionPreview,
  isSelected,
}: {
  colors: AppColors;
  chipIndex: number;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  uri?: string | null;
  previewUris?: string[];
  onPress: () => void;
  showChevron?: boolean;
  actionLabel?: string;
  last?: boolean;
  thumbSize?: "default" | "large";
  busy?: boolean;
  selectionPreview?: boolean;
  /** True when a catalog item is chosen but preview URL may be unavailable. */
  isSelected?: boolean;
}) {
  const styles = useOrgDetailsStyles();
  if (selectionPreview) {
    const hasMultiTags = Boolean(previewUris?.length);
    const filled = Boolean(uri) || hasMultiTags || Boolean(isSelected);
    return (
      <View
        style={[
          styles.selectionBlock,
          { borderBottomColor: colors.border },
          last && styles.uploadRowLast,
        ]}
      >
        <View style={styles.selectionHeader}>
          <IconChip name={icon} index={chipIndex} />
          <View style={styles.uploadTextWrap}>
            <Text style={[styles.uploadLabel, { color: colors.text }]} numberOfLines={1}>
              {label}
            </Text>
            {sublabel && !uri && !hasMultiTags ? (
              <Text style={[styles.uploadSublabel, { color: colors.textBody }]}>
                {sublabel}
              </Text>
            ) : null}
          </View>
          {!filled ? (
            <Pressable
              onPress={onPress}
              style={[
                styles.selectBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
            >
              <Ionicons name="add" size={14} color={colors.textMuted} />
              <Text style={[styles.selectBtnText, { color: colors.textSecondary }]}>
                {actionLabel}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.filledActions}>
              <View
                style={[styles.checkBadge, { backgroundColor: colors.brandGreen }]}
              >
                <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              </View>
              <Pressable
                onPress={onPress}
                style={[styles.editBtn, { borderColor: colors.primaryOrange }]}
                hitSlop={8}
              >
                <Ionicons name="create-outline" size={14} color={colors.primaryOrange} />
                <Text style={[styles.editBtnText, { color: colors.primaryOrange }]}>
                  Edit
                </Text>
              </Pressable>
            </View>
          )}
        </View>
        {filled ? (
          <View style={[styles.selectionImageWrap, { backgroundColor: colors.graySoft }]}>
            {busy ? (
              <ActivityIndicator size="small" color={colors.brandGreen} />
            ) : null}
            {hasMultiTags ? (
              <View style={styles.tagPreviewRow}>
                {previewUris!.map((tagUri, idx) => (
                  <Image
                    key={`${tagUri}-${idx}`}
                    source={{ uri: tagUri }}
                    style={styles.tagPreviewThumb}
                    resizeMode="contain"
                  />
                ))}
              </View>
            ) : uri ? (
              <Image
                source={{ uri }}
                style={styles.selectionImage}
                resizeMode="contain"
                onError={() => {
                  /* uri failed — row still shows header + check */
                }}
              />
            ) : sublabel ? (
              <Text style={[styles.selectionFallback, { color: colors.text }]}>
                {sublabel}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Pressable
      style={[
        styles.uploadRow,
        { borderBottomColor: colors.border },
        last && styles.uploadRowLast,
      ]}
      onPress={onPress}
    >
      <IconChip name={icon} index={chipIndex} />
      <View style={styles.uploadTextWrap}>
        <Text style={[styles.uploadLabel, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={[styles.uploadSublabel, { color: colors.textBody }]}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {uri ? (
        <View style={styles.uploadedRight}>
          {busy ? (
            <ActivityIndicator size="small" color={colors.brandGreen} />
          ) : null}
          <Image
            key={uri}
            source={{ uri }}
            style={[
              thumbSize === "large" ? styles.uploadThumbLarge : styles.uploadThumb,
              { backgroundColor: colors.graySoft },
            ]}
            resizeMode="contain"
          />
          <View
            style={[styles.checkBadge, { backgroundColor: colors.brandGreen }]}
          >
            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
          </View>
        </View>
      ) : showChevron ? (
        <View
          style={[
            styles.selectBtn,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <Ionicons name="add" size={14} color={colors.textMuted} />
          <Text style={[styles.selectBtnText, { color: colors.textSecondary }]}>
            {actionLabel}
          </Text>
        </View>
      ) : (
        <View
          style={[
            styles.selectBtn,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
          ]}
        >
          <Ionicons name="cloud-upload" size={14} color={colors.textMuted} />
          <Text style={[styles.selectBtnText, { color: colors.textSecondary }]}>
            {actionLabel}
          </Text>
        </View>
      )}
    </Pressable>
  );
});

const ReadOnlyField = memo(function ReadOnlyField({
  colors,
  label,
  value,
  multiline,
  last,
}: {
  colors: AppColors;
  label: string;
  value: string;
  multiline?: boolean;
  last?: boolean;
}) {
  const styles = useOrgDetailsStyles();
  return (
    <View style={[styles.readOnlyField, last && styles.readOnlyFieldLast]}>
      <Text style={[styles.readOnlyLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[styles.readOnlyValue, { color: colors.text }, multiline && styles.readOnlyMultiline]}
      >
        {value}
      </Text>
    </View>
  );
});

const FormField = memo(function FormField({  colors,
  label,
  icon,
  chipIndex,
  children,
  last,
}: {
  colors: AppColors;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  chipIndex: number;
  children: ReactNode;
  last?: boolean;
}) {
  const styles = useOrgDetailsStyles();
  return (
    <View style={[styles.formField, last && styles.formFieldLast]}>
      <Text style={[styles.formLabel, { color: colors.text }]}>{label}</Text>
      <View
        style={[
          styles.formInputBox,
          {
            backgroundColor: colors.background,
            borderColor: colors.border,
          },
        ]}
      >
        <IconChip name={icon} index={chipIndex} size={34} iconSize={18} />
        <View style={styles.formInputInner}>{children}</View>
      </View>
    </View>
  );
});

function useOrgDetailsStyles() {
  return useResponsiveStyles(({ scale, modalWidth }) => ({
    root: { flex: 1 },
    flex: { flex: 1 },
    scroll: {
      paddingHorizontal: spacing.pagePad,
      paddingTop: spacing.sectionGap,
    },
    cardSpacing: {
      marginBottom: spacing.md,
    },

    card: {
      borderRadius: radius.card,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderWidth: 1,
      ...cardShadow,
    },

    uploadRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.sm,
      gap: spacing.iconTextGap,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    uploadRowLast: { borderBottomWidth: 0, paddingBottom: spacing.xxs },
    uploadTextWrap: { flex: 1 },
    uploadLabel: {
      ...textStyles.fieldLabel,
      fontSize: typeScale.subtitle,
    },
    uploadSublabel: {
      ...textStyles.body,
      marginTop: spacing.xxs / 2,
    },
    uploadedRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    uploadThumb: {
      width: spacing.avatarSm,
      height: spacing.avatarSm,
      borderRadius: radius.sm,
    },
    uploadThumbLarge: {
      width: spacing.avatarLg + scale(48),
      height: spacing.avatarLg + scale(48),
      borderRadius: radius.md,
    },
    selectionBlock: {
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: spacing.sm,
    },
    selectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.iconTextGap,
    },
    selectionImageWrap: {
      width: "100%",
      minHeight: scale(220),
      borderRadius: radius.md,
      padding: spacing.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    selectionImage: {
      width: "100%",
      height: scale(200),
    },
    tagPreviewRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      justifyContent: "center",
      width: "100%",
    },
    tagPreviewThumb: {
      width: scale(140),
      height: scale(72),
      borderRadius: radius.sm,
    },
    selectionFallback: {
      fontFamily: fonts.semiBold,
      fontSize: typeScale.rowTitle,
      textAlign: "center",
      paddingHorizontal: spacing.sm,
    },
    selectionCaption: {
      marginTop: spacing.xxs,
      fontFamily: fonts.interMedium,
      fontSize: typeScale.subtitle,
      textAlign: "center",
    },
    yearPressable: {
      flex: 1,
      justifyContent: "center",
    },
    checkBadge: {
      width: spacing.lg - 2,
      height: spacing.lg - 2,
      borderRadius: (spacing.lg - 2) / 2,
      alignItems: "center",
      justifyContent: "center",
    },
    selectBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xxs,
      borderWidth: 1,
      borderStyle: "dashed",
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    selectBtnText: {
      fontFamily: fonts.interMedium,
      fontSize: typeScale.subtitle,
    },
    filledActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    editBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xxs,
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs + 2,
    },
    editBtnText: {
      fontFamily: fonts.semiBold,
      fontSize: typeScale.subtitle,
    },
    readOnlyBlock: {
      gap: spacing.sm,
    },
    readOnlyField: {
      marginBottom: spacing.sm,
    },
    readOnlyFieldLast: {
      marginBottom: spacing.xxs,
    },
    readOnlyLabel: {
      fontFamily: fonts.medium,
      fontSize: typeScale.subtitle,
      marginBottom: spacing.xxs / 2,
    },
    readOnlyValue: {
      fontFamily: fonts.regular,
      fontSize: typeScale.body,
      lineHeight: typeScale.body * 1.4,
    },
    readOnlyMultiline: {
      textAlignVertical: "top",
    },
    sectionEditBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xxs,
      alignSelf: "flex-start",
      borderWidth: 1,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      marginTop: spacing.xs,
    },
    sectionEditText: {
      fontFamily: fonts.semiBold,
      fontSize: typeScale.sm,
    },

    formField: { marginBottom: spacing.fieldGap },
    formFieldLast: { marginBottom: spacing.xxs },
    formLabel: {
      ...textStyles.fieldLabel,
      marginBottom: spacing.labelGap,
    },
    formInputBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.iconTextGap,
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      minHeight: spacing.buttonHeight - 2,
    },
    formInputInner: { flex: 1 },
    input: {
      flex: 1,
      ...textStyles.input,
      padding: 0,
      minHeight: spacing.lg + 4,
    },
    multiline: { minHeight: spacing.avatarSm + 4, textAlignVertical: "top" },
    multilineTall: { minHeight: spacing.avatarMd, textAlignVertical: "top" },
    charCount: {
      alignSelf: "flex-end",
      fontFamily: fonts.interRegular,
      fontSize: typeScale.subtitle,
      marginTop: spacing.xxs,
    },

    error: {
      fontFamily: fonts.interRegular,
      fontSize: typeScale.body,
    },

    stickySubmit: {
      paddingHorizontal: spacing.pagePad,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    submitFull: {
      width: "100%",
      alignSelf: "stretch",
    },
    confirmBackdrop: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: spacing.xl,
    },
    confirmCard: {
      width: "100%",
      maxWidth: modalWidth,
      borderRadius: radius.lg,
      padding: spacing.lg,
    },
    confirmTitle: {
      ...textStyles.h3,
    },
    confirmBody: {
      marginTop: spacing.sm,
      fontFamily: fonts.interRegular,
      fontSize: typeScale.body,
      lineHeight: typeScale.body * 1.45,
    },
    confirmActions: {
      marginTop: spacing.lg,
      flexDirection: "row",
      gap: spacing.sm,
      alignItems: "center",
    },
    confirmCancel: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
      alignItems: "center",
      justifyContent: "center",
    },
    confirmCancelText: {
      fontFamily: fonts.semiBold,
      fontSize: typeScale.sm,
    },
  }));
}
