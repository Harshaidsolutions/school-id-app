import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import api from "../api/client";
import { studentFieldDisplay } from "../constants/formFields";
import type { Student } from "../types";
import type { ConfiguredCategoryField } from "../utils/formFieldHelpers";
import { authenticatedStudentPhotoUrl, invalidateStudentPhotoCache } from "../utils/studentPhotoSrc";

type Crop = { cx: number; cy: number; w: number; h: number; angle: number };
type Handle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";
type Hit = Handle | "move" | "rotate";
type Drag =
  | { kind: "move"; startX: number; startY: number; origin: Crop }
  | { kind: "resize"; handle: Handle; startX: number; startY: number; origin: Crop }
  | { kind: "rotate"; startPointer: number; origin: Crop }
  | { kind: "create"; startX: number; startY: number; origin: Crop };

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const MIN_SIZE = 0.04;
const FULL: Crop = { cx: 0.5, cy: 0.5, w: 1, h: 1, angle: 0 };

export function CropToolModal({
  students,
  categories,
  onClose,
  onSaved,
  layout = "page",
  storageKey = "crop",
}: {
  students: Student[];
  categories: ConfiguredCategoryField[];
  onClose: () => void;
  onSaved: (student: Student) => void;
  layout?: "page" | "modal";
  storageKey?: string;
}) {
  const field = useMemo(() => primaryCategory(categories), [categories]);
  const [cropView, setCropView] = useState<"uncropped" | "cropped">("uncropped");
  const photos = useMemo(
    () => students.filter((student) => {
      if (!student.photo_url) return false;
      return cropView === "cropped" ? student.photo_cropped === true : student.photo_cropped !== true;
    }),
    [students, cropView]
  );
  const [selected, setSelected] = useState("");
  const [captureDay, setCaptureDay] = useState("");
  const [captureHour, setCaptureHour] = useState("");
  const dated = useMemo(() => {
    return photos.map((student) => ({ student, parts: captureParts(student.photo_captured_at) }));
  }, [photos]);
  const dateOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of dated) {
      if (!item.parts) continue;
      counts.set(item.parts.day, (counts.get(item.parts.day) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [dated]);
  const hourOptions = useMemo(() => {
    if (!captureDay) return [];
    const counts = new Map<number, number>();
    for (const item of dated) {
      if (item.parts?.day !== captureDay) continue;
      counts.set(item.parts.hour, (counts.get(item.parts.hour) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0] - b[0]);
  }, [dated, captureDay]);
  const gallery = useMemo(() => {
    return dated
      .filter((item) => !field || !selected || categoryValue(item.student, field) === selected)
      .filter((item) => !captureDay || item.parts?.day === captureDay)
      .filter((item) => captureHour === "" || item.parts?.hour === Number(captureHour))
      .map((item) => item.student);
  }, [dated, field, selected, captureDay, captureHour]);
  const options = useMemo(() => {
    if (!field) return [];
    const values = new Set<string>();
    for (const student of photos) {
      const value = categoryValue(student, field);
      if (value) values.add(value);
    }
    return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [photos, field]);

  const [index, setIndex] = useState(0);
  const [src, setSrc] = useState("");
  const [phase, setPhase] = useState<"edit" | "preview">("edit");
  const [previewUrl, setPreviewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [frameLimit, setFrameLimit] = useState({ width: 720, height: 520 });
  const [toneOpen, setToneOpen] = useState(false);
  const [browsing, setBrowsing] = useState(true);
  const [cropArmed, setCropArmed] = useState(false);
  const [limitWidth, setLimitWidth] = useState("");
  const [limitHeight, setLimitHeight] = useState("");
  const [limitUnit, setLimitUnit] = useState<CropUnit>("cm");

  const [sizeHydrated, setSizeHydrated] = useState(false);
  const [viewZoom,setViewZoom] = useState({scale:1,x:0,y:0});
  const imageRef = useRef<HTMLImageElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const tonePanelRef = useRef<HTMLDivElement>(null);
  const toneButtonRef = useRef<HTMLButtonElement>(null);
  const toneImageRef = useRef<HTMLImageElement>(null);
  const cropRef = useRef<Crop>({ ...FULL });
  const previewImageRef = useRef<HTMLImageElement>(null);
  const acceptedCropRef = useRef<{image:HTMLImageElement;crop:Crop;size:{width:number;height:number}} | null>(null);
  const toneRef = useRef({ brightness: 0, contrast: 0 });
  const toneGestureRef = useRef(false);
  const brightnessInputRef = useRef<HTMLInputElement>(null);
  const contrastInputRef = useRef<HTMLInputElement>(null);
  const brightnessLabelRef = useRef<HTMLSpanElement>(null);
  const contrastLabelRef = useRef<HTMLSpanElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const previewBlobRef = useRef<Blob | null>(null);
  const previewUrlRef = useRef("");
  const paintRef = useRef(0);
  const tonePaintRef = useRef(0);
  const toneStudentRef = useRef<string | undefined>(undefined);
  const limitRef = useRef<{ width: number | null; height: number | null }>({ width: null, height: null });
  const historyRef = useRef<Array<Crop & { brightness: number; contrast: number; armed: boolean }>>([]);
  const undoRef = useRef<() => void>(() => {});
  const quickSaveRef = useRef<() => void>(() => {});
  const student = gallery[index] ?? null;

  useEffect(() => {
    if (index > gallery.length - 1) setIndex(0);
  }, [gallery.length, index]);

  useEffect(() => {
    setSizeHydrated(false);
    const saved = readCropSize(storageKey);
    setLimitWidth(saved.width);
    setLimitHeight(saved.height);
    setLimitUnit(saved.unit);

    const width = Number(saved.width);
    const height = Number(saved.height);
    limitRef.current = {
      width: Number.isFinite(width) && width > 0 ? width : null,
      height: Number.isFinite(height) && height > 0 ? height : null,
    };
    setSizeHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!sizeHydrated) return;
    if (!limitWidth.trim() && !limitHeight.trim()) {
      const existing = readCropSize(storageKey);
      if (existing.width || existing.height) return;
    }
    writeCropSize(storageKey, { width: limitWidth, height: limitHeight, unit: limitUnit, locked: false });
  }, [sizeHydrated, storageKey, limitWidth, limitHeight, limitUnit]);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      if (paintRef.current) cancelAnimationFrame(paintRef.current);
      if (tonePaintRef.current) cancelAnimationFrame(tonePaintRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setSrc("");
    setPhase("edit");
    setCropArmed(false);
    setError(null);
    cropRef.current = { ...FULL };
    historyRef.current = [];
    toneRef.current = { brightness: 0, contrast: 0 };
    toneGestureRef.current = false;
    setToneOpen(false);
    previewBlobRef.current = null;
    clearPreview();
    if (!student?.photo_url) return;
    void loadCropPhoto(student, controller.signal).then((url) => {
      if (!cancelled) setSrc(url || "");
    }).catch(() => {
      if (!cancelled) setError("Could not load photo. Please try again.");
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [student?.id, student?.photo_url, student?.updated_at]);

  useEffect(() => {
    if (browsing || cropView === "cropped" || !student?.photo_cropped) return;
    const nextIndex = gallery.findIndex((item) => item.photo_cropped !== true);
    if (nextIndex >= 0) {
      setIndex(nextIndex);
      return;
    }
    setBrowsing(true);
  }, [browsing, cropView, student?.id, student?.photo_cropped, gallery]);

  useLayoutEffect(() => {
    if (toneStudentRef.current !== student?.id) {
      toneStudentRef.current = student?.id;
      toneRef.current = { brightness: 0, contrast: 0 };
      toneGestureRef.current = false;
    }
    paintFrame();
    paintTone();
  }, [src, phase, student?.id, frameLimit, toneOpen]);

  useEffect(() => {
    if (!toneOpen) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (tonePanelRef.current?.contains(target) || toneButtonRef.current?.contains(target)) return;
      setToneOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [toneOpen]);

  useEffect(() => {
    const node = workspaceRef.current;
    if (!node) return;
    const measure = () => {
      const box = node.getBoundingClientRect();
      setFrameLimit({
        width: Math.max(160, Math.floor(box.width - 48)),
        height: Math.max(160, Math.floor(box.height - 96)),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [phase, student?.id, src, browsing]);

  useEffect(() => {setViewZoom({scale:1,x:0,y:0});},[student?.id,src,phase]);
  useEffect(() => {
    const workspace=workspaceRef.current;
    if(!workspace || phase!=="edit" || browsing)return;
    const wheel=(event:WheelEvent)=>{
      const stage=stageRef.current, image=imageRef.current;
      if(!stage||!image||dragRef.current)return;
      const box=stage.getBoundingClientRect();
      if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)return;
      event.preventDefault();
      const area=workspace.getBoundingClientRect();
      const px=event.clientX-(area.left+area.width/2),py=event.clientY-(area.top+area.height/2);
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?area.height:1);
      setViewZoom(old=>{
        const scale=Math.min(5,Math.max(1,old.scale*Math.exp(-delta*0.0015)));
        if(scale===1)return {scale:1,x:0,y:0};
        const ratio=scale/old.scale;
        const maxX=image.offsetWidth*(scale-1)/2,maxY=image.offsetHeight*(scale-1)/2;
        return {scale,x:Math.max(-maxX,Math.min(maxX,px-(px-old.x)*ratio)),y:Math.max(-maxY,Math.min(maxY,py-(py-old.y)*ratio))};
      });
    };
    workspace.addEventListener("wheel",wheel,{passive:false});
    return ()=>workspace.removeEventListener("wheel",wheel);
  },[phase,browsing,student?.id,src]);

  function markDirty(studentId: string) {
    setEditingId(studentId);
    setSavedIds((current) => {
      if (!current.has(studentId)) return current;
      const next = new Set(current);
      next.delete(studentId);
      return next;
    });
  }

  function clearPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = "";
    setPreviewUrl("");
  }

  useLayoutEffect(() => { if (cropArmed) paintFrame(); }, [cropArmed, src, phase]);

  function paintFrame() {
    const frame = frameRef.current;
    const crop = cropRef.current;
    if (!frame) return;
    frame.style.left = `${(crop.cx - crop.w / 2) * 100}%`;
    frame.style.top = `${(crop.cy - crop.h / 2) * 100}%`;
    frame.style.width = `${crop.w * 100}%`;
    frame.style.height = `${crop.h * 100}%`;
    frame.style.transform = `rotate(${crop.angle}deg)`;
    paintTone();
  }

  function paintTone() {
    const { brightness, contrast } = toneRef.current;
    if (previewImageRef.current) previewImageRef.current.style.filter = toneFilter(brightness, contrast);
    const image = toneImageRef.current;
    const base = imageRef.current;
    if (image && base) {
      const crop = cropRef.current;
      const angle = crop.angle * Math.PI / 180;
      const iw = base.naturalWidth || 1;
      const ih = base.naturalHeight || 1;
      const points = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => {
        const dx = x * crop.w * iw / 2, dy = y * crop.h * ih / 2;
        return `${100 * (crop.cx + (dx*Math.cos(angle)-dy*Math.sin(angle))/iw)}% ${100 * (crop.cy + (dx*Math.sin(angle)+dy*Math.cos(angle))/ih)}%`;
      });
      image.style.clipPath = `polygon(${points.join(",")})`;
      image.style.filter = toneFilter(brightness, contrast);
    }
    if (brightnessInputRef.current) brightnessInputRef.current.value = String(Math.round(brightness));
    if (contrastInputRef.current) contrastInputRef.current.value = String(Math.round(contrast));
    if (brightnessLabelRef.current) brightnessLabelRef.current.textContent = String(Math.round(brightness));
    if (contrastLabelRef.current) contrastLabelRef.current.textContent = String(Math.round(contrast));
  }

  function scheduleTonePaint() {
    if (tonePaintRef.current) return;
    tonePaintRef.current = requestAnimationFrame(() => {
      tonePaintRef.current = 0;
      paintTone();
    });
  }

  function beginToneEdit() {
    if (!toneGestureRef.current && student) {
      rememberCrop();
      toneGestureRef.current = true;
      markDirty(student.id);
    }
  }

  function applyTone(brightness: number, contrast: number) {
    if(saving)return;
    const next = {
      brightness: clampNumber(brightness, -100, 100),
      contrast: clampNumber(contrast, -100, 100),
    };
    const current = toneRef.current;
    if (next.brightness !== current.brightness || next.contrast !== current.contrast) beginToneEdit();
    toneRef.current = next;
    scheduleTonePaint();
  }

  function resetTone() {
    applyTone(0, 0);
    toneGestureRef.current = false;
  }

  function resetWorkspace() {
    cropRef.current = { ...FULL };
    historyRef.current = [];
    setCropArmed(false);
    setPhase("edit");
    previewBlobRef.current = null;
    clearPreview();
    toneRef.current = { brightness: 0, contrast: 0 };
    toneGestureRef.current = false;
    paintTone();
    paintFrame();
  }

  function endToneGesture() {
    toneGestureRef.current = false;
  }

  function rememberCrop() {
    const current = { ...cropRef.current, ...toneRef.current, armed: cropArmed };
    const last = historyRef.current[historyRef.current.length - 1];
    if (
      last &&
      last.cx === current.cx &&
      last.cy === current.cy &&
      last.w === current.w &&
      last.h === current.h &&
      last.angle === current.angle && last.armed === current.armed &&
      last.brightness === current.brightness && last.contrast === current.contrast
    ) {
      return;
    }
    historyRef.current.push(current);
    if (historyRef.current.length > 40) historyRef.current.shift();
  }

  function undoCrop() {
    if (browsing) return;
    if (phase === "preview") {
      previewBlobRef.current = null;
      clearPreview();
      setPreviewUrl("");
      setPhase("edit");
      return;
    }
    const previous = historyRef.current.pop();
    if (!previous) return;
    cropRef.current = previous;
    setCropArmed(previous.armed);
    toneRef.current = { brightness: previous.brightness, contrast: previous.contrast };
    paintTone();
    paintFrame();
  }

  function rotateCrop(delta: number) {
    if (!student || phase !== "edit" || !cropArmed) return;
    rememberCrop();
    markDirty(student.id);
    cropRef.current = limitCrop({ ...cropRef.current, angle: cropRef.current.angle + delta }, imageRef.current, limitRef.current);
    paintFrame();
  }

  function applyCropLimit(widthRaw: string, heightRaw: string) {
    const width = Number(widthRaw);
    const height = Number(heightRaw);
    limitRef.current = {
      width: Number.isFinite(width) && width > 0 ? width : null,
      height: Number.isFinite(height) && height > 0 ? height : null,
    };
    if (cropArmed && limitRef.current.width != null && limitRef.current.height != null) {
      rememberCrop();
      cropRef.current = limitCrop(cropRef.current, imageRef.current, limitRef.current);
      paintFrame();
    }
  }

  function updateCropLimit(axis: "width" | "height", raw: string) {

    const cleaned = parseMeasure(raw);
    const width = axis === "width" ? cleaned : limitWidth;
    const height = axis === "height" ? cleaned : limitHeight;
    if (axis === "width") setLimitWidth(cleaned);
    else setLimitHeight(cleaned);
    applyCropLimit(width, height);
  }

  function changeCropUnit(next: CropUnit) {
    if (next === limitUnit) return;
    const factor = toMillimeters(1, limitUnit) / toMillimeters(1, next);
    const width = convertMeasure(limitWidth, factor);
    const height = convertMeasure(limitHeight, factor);
    setLimitUnit(next);
    setLimitWidth(width);
    setLimitHeight(height);
    applyCropLimit(width, height);
  }

  function schedulePaint() {
    if (paintRef.current) return;
    paintRef.current = requestAnimationFrame(() => {
      paintRef.current = 0;
      paintFrame();
    });
  }

  function pointOf(event: ReactPointerEvent): { x: number; y: number } | null {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    return {
      x: (event.clientX - box.left) / box.width,
      y: (event.clientY - box.top) / box.height,
    };
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (phase !== "edit" || !student || (student.photo_cropped && cropView !== "cropped")) return;
    const box = stageRef.current?.getBoundingClientRect();
    const point = pointOf(event);
    if (!box || !point || event.button !== 0 || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return;
    if (!cropArmed || !hitTest(event.clientX, event.clientY, cropRef.current, box)) {
      rememberCrop();
      const next = { cx: point.x, cy: point.y, w: MIN_SIZE, h: MIN_SIZE, angle: cropRef.current.angle };
      cropRef.current = next;
      setCropArmed(true);
      markDirty(student.id);
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { kind: "create", startX: point.x, startY: point.y, origin: next };
      paintFrame();
      return;
    }
    const hit = hitTest(event.clientX, event.clientY, cropRef.current, box);
    if (!hit) return;
    rememberCrop();
    if (student) markDirty(student.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (hit === "rotate") {
      dragRef.current = {
        kind: "rotate",
        startPointer: pointerAngle(event.clientX, event.clientY, cropRef.current, box),
        origin: { ...cropRef.current },
      };
      return;
    }
    if (hit === "move") {
      dragRef.current = { kind: "move", startX: point.x, startY: point.y, origin: { ...cropRef.current } };
      return;
    }
    dragRef.current = { kind: "resize", handle: hit, startX: point.x, startY: point.y, origin: { ...cropRef.current } };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const box = stageRef.current?.getBoundingClientRect();
    const drag = dragRef.current;
    if (!box) return;
    if (!drag) {
      event.currentTarget.style.cursor = cropArmed ? cursorFor(hitTest(event.clientX, event.clientY, cropRef.current, box)) : "crosshair";
      return;
    }
    if (drag.kind === "rotate") {
      const current = pointerAngle(event.clientX, event.clientY, drag.origin, box);
      cropRef.current = limitCrop({
        ...drag.origin,
        angle: drag.origin.angle + (angleDelta(current, drag.startPointer) * 180) / Math.PI,
      }, imageRef.current, limitRef.current);
      event.currentTarget.style.cursor = "grabbing";
      schedulePaint();
      return;
    }
    const point = pointOf(event);
    if (!point) return;
    if (drag.kind === "create") {
      const left = Math.min(drag.startX, point.x);
      const top = Math.min(drag.startY, point.y);
      const w = Math.max(MIN_SIZE, Math.abs(point.x - drag.startX));
      const h = Math.max(MIN_SIZE, Math.abs(point.y - drag.startY));
      cropRef.current = limitCrop(
        clampCrop({
          cx: left + w / 2,
          cy: top + h / 2,
          w,
          h,
          angle: drag.origin.angle,
        }),
        imageRef.current,
        limitRef.current
      );
      event.currentTarget.style.cursor = "crosshair";
      schedulePaint();
      return;
    }
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    const next =
      drag.kind === "move"
        ? clampCrop({ ...drag.origin, cx: drag.origin.cx + dx, cy: drag.origin.cy + dy })
        : clampCrop(resizeCrop(drag.origin, drag.handle, dx, dy, box.width / box.height));
    cropRef.current = limitCrop(next, imageRef.current, limitRef.current);
    event.currentTarget.style.cursor = cursorFor(drag.kind === "move" ? "move" : drag.handle);
    schedulePaint();
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function applyOk() {
    const image = imageRef.current;
    if (!image || !src || applying || !image.naturalWidth || !cropArmed) return;
    if ((limitWidth || limitHeight) && !(Number(limitWidth) > 0 && Number(limitHeight) > 0)) {
      setError("Enter both a positive width and height, or clear both for a free crop."); return;
    }
    if (student) markDirty(student.id);
    setApplying(true);
    setError(null);
    try {
      const snapshot = { image, crop: {...cropRef.current}, size: { width: toMillimeters(Number(limitWidth), limitUnit), height: toMillimeters(Number(limitHeight), limitUnit) } };
      const blob = await renderCrop(image, snapshot.crop, {brightness:0,contrast:0}, snapshot.size);
      acceptedCropRef.current = snapshot;
      clearPreview();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      previewBlobRef.current = blob;
      setPreviewUrl(url);
      setPhase("preview");
    } catch {
      setError("Could not prepare the crop preview. Use positive dimensions up to 8192 pixels at 300 DPI.");
    } finally {
      setApplying(false);
    }
  }

  async function saveCrop() {
    const snapshot = acceptedCropRef.current;
    if (!student || !previewBlobRef.current || !snapshot || saving) return;
    setSaving(true);
    setError(null);
    try {
      const blob = await renderCrop(snapshot.image,snapshot.crop,{...toneRef.current},snapshot.size);
      const body = new FormData();
      body.append("photo", blob, `${student.photo_id || student.id}.jpg`);
      body.append("markCropped", "1");
      const savedIndex = gallery.findIndex((item) => item.id === student.id);
      const hasNext = savedIndex >= 0 && savedIndex + 1 < gallery.length;
      const { data } = await api.post<{ student: Student }>(
        isOrganizationCropPhoto(student) ? student.photo_url! : `/admin/students/${student.id}/photo`,
        body
      );
      if (!data.student?.photo_cropped) {
        throw new Error("Crop status was not saved");
      }
      invalidateStudentPhotoCache(student.id);
      onSaved(data.student);
      setEditingId((current) => (current === student.id ? null : current));
      setCropArmed(false);
      setPhase("edit");
      if (!hasNext) setBrowsing(true);
    } catch {
      setError("Could not save the cropped photo.");
    } finally {
      setSaving(false);
    }
  }

  async function quickSave() {
    if (browsing || saving || applying || !student || (student.photo_cropped && cropView !== "cropped")) return;
    if (!previewBlobRef.current) await applyOk();
    if (previewBlobRef.current) await saveCrop();
  }

  undoRef.current = undoCrop;
  quickSaveRef.current = () => {
    void quickSave();
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        undoRef.current();
      } else if (key === "s") {
        event.preventDefault();
        quickSaveRef.current();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function canLeaveEditor() {
    if (saving || applying) return false;
    if (!editingId || window.confirm("Discard unsaved photo changes?")) {
      setEditingId(null);
      return true;
    }
    return false;
  }

  useEffect(() => {
    if (!editingId) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editingId]);

  function leaveEditor() {
    if (!canLeaveEditor()) return;
    setCropArmed(false);
    setPhase("edit");
    setBrowsing(true);
  }

  const shell = layout === "page"
    ? "crop-tool-shell flex min-h-0 flex-1 flex-col overflow-hidden"
    : "fixed inset-0 z-50 flex items-center justify-center bg-[#312E81]/35 px-3 py-4";

  return (
    <div className={shell} role={layout === "page" ? undefined : "dialog"} aria-modal={layout === "page" ? undefined : true} aria-label="Cropping Tool">
      <div className={`crop-tool-layout ${layout === "page" ? "flex min-h-0 flex-1 overflow-hidden" : "flex h-[min(92vh,860px)] w-full max-w-6xl overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white"}`}>
        <aside className="crop-settings flex w-[17.5rem] shrink-0 flex-col gap-3 overflow-y-auto border-r border-[#E2E8F0] bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-semibold text-[#64748B]">
              {student && !browsing ? student.student_name ?? "Student" : `${gallery.length} photo${gallery.length === 1 ? "" : "s"}`}
              {student && !browsing && student.photo_id ? ` · Photo ${student.photo_id}` : ""}
            </p>
            <button type="button" className="btn-secondary shrink-0 px-3 py-1.5 text-sm" onClick={() => { if (canLeaveEditor()) onClose(); }}>Back</button>
          </div>
          {field ? (
            <label className="min-w-[12rem] text-xs font-semibold text-[#485989]">
              {field.label}
              <select className="input-field mt-1" value={selected} onChange={(event) => { if (!canLeaveEditor()) return; setSelected(event.target.value); setIndex(0); setBrowsing(true); }}>
                <option value="">{`All ${field.label}`}</option>
                {options.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="min-w-[12rem] text-xs font-semibold text-[#485989]">
            Date
            <select className="input-field mt-1" value={captureDay} onChange={(event) => { if (!canLeaveEditor()) return; setCaptureDay(event.target.value); setCaptureHour(""); setIndex(0); setBrowsing(true); }}>
              <option value="">All dates</option>
              {dateOptions.map(([day, count]) => (
                <option key={day} value={day}>{formatCaptureDay(day)} ({count})</option>
              ))}
            </select>
          </label>
          <label className="min-w-[11rem] text-xs font-semibold text-[#485989]">
            Status
            <select
              className="input-field mt-1"
              value={cropView}
              onChange={(event) => {
                if (!canLeaveEditor()) return;
                setCropView(event.target.value === "cropped" ? "cropped" : "uncropped");
                setIndex(0);
                setBrowsing(true);
              }}
            >
              <option value="uncropped">Not cropped</option>
              <option value="cropped">Cropped</option>
            </select>
          </label>
          <label className="min-w-[14rem] text-xs font-semibold text-[#485989]">
            Hour
            <select className="input-field mt-1" value={captureHour} disabled={!captureDay} onChange={(event) => { if (!canLeaveEditor()) return; setCaptureHour(event.target.value); setIndex(0); setBrowsing(true); }}>
              <option value="">{captureDay ? "All hours" : "Select a date first"}</option>
              {hourOptions.map(([hour, count]) => (
                <option key={hour} value={hour}>{formatCaptureHour(hour)} ({count})</option>
              ))}
            </select>
          </label>
          <label className="min-w-[7rem] text-xs font-semibold text-[#485989]">
            Unit
            <select
              aria-label="Crop size unit"
              className="input-field mt-1"
              value={limitUnit}

              onChange={(event) => changeCropUnit(event.target.value === "in" ? "in" : event.target.value === "mm" ? "mm" : "cm")}
            >
              <option value="in">Inches</option>
              <option value="cm">Centimeters</option>
              <option value="mm">Millimeters</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[#485989]">
            Width
            <input value={limitWidth} inputMode="decimal" aria-label="Crop width"  className="input-field mt-1" onChange={(event) => updateCropLimit("width", event.target.value)} />
          </label>
          <label className="text-xs font-semibold text-[#485989]">
            Height
            <input value={limitHeight} inputMode="decimal" aria-label="Crop height"  className="input-field mt-1" onChange={(event) => updateCropLimit("height", event.target.value)} />
          </label>

          <p className="text-[11px] font-medium text-[#64748B]">
            {limitWidth && limitHeight
              ? `${limitWidth} × ${limitHeight} ${limitUnit === "in" ? "inches" : limitUnit === "mm" ? "mm" : "cm"} · 300 DPI`
              : "Choose inches, centimeters, or millimeters, then enter width and height."}
          </p>
          {!browsing ? (
            <>
              <label className="text-xs font-semibold text-[#485989]">
                Rotate
                <select
                  aria-label="Rotate"
                  className="input-field mt-1"
                  defaultValue=""
                  disabled={!cropArmed || phase !== "edit" || (student?.photo_cropped === true && cropView !== "cropped")}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    event.currentTarget.value = "";
                    if (value === "left") rotateCrop(-90);
                    if (value === "right") rotateCrop(90);
                  }}
                >
                  <option value="">Choose rotation</option>
                  <option value="left">Rotate Left</option>
                  <option value="right">Rotate Right</option>
                </select>
              </label>
              <p className="text-[11px] font-medium text-[#64748B]">Drag on the photo to crop. Shift+Z undo · Shift+S save</p>
            </>
          ) : null}
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {browsing ? (
          <div className="grid grid-cols-2 gap-3 overflow-y-auto p-4 md:grid-cols-3 xl:grid-cols-4">
            {gallery.map((item, itemIndex) => (
              <GalleryThumb
                key={item.id}
                student={item}
                large
                active={itemIndex === index}
                status={
                  item.photo_cropped
                    ? "cropped"
                    : editingId === item.id
                      ? "editing"
                      : savedIds.has(item.id)
                        ? "saved"
                        : null
                }
                onClick={() => {
                  if (!canLeaveEditor()) return;
                  setIndex(itemIndex);
                  setCropArmed(false);
                  setBrowsing(false);
                }}
              />
            ))}
            {gallery.length === 0 ? (
              <p className="col-span-full px-2 py-16 text-center text-sm font-medium text-[#64748B]">
                {photos.length === 0
                  ? cropView === "cropped"
                    ? "No cropped photos."
                    : "All photos are cropped."
                  : "No photos match these filters."}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#EEF2FF]">
            <div className="crop-image-area relative min-h-0 flex-1">
              <div
                ref={workspaceRef}
                className="absolute inset-0 flex items-center justify-center overflow-hidden"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {phase === "preview" && previewUrl ? (
                  <img
                    ref={previewImageRef}
                    src={previewUrl}
                    alt="Cropped preview"
                    className="block h-auto w-auto object-contain"
                    style={{ maxWidth: frameLimit.width, maxHeight: frameLimit.height, filter: toneFilter(toneRef.current.brightness,toneRef.current.contrast) }}
                  />
                ) : src && student ? (
                  <div ref={stageRef} className="relative inline-block max-h-full max-w-full touch-none" style={{transform:`translate(${viewZoom.x}px, ${viewZoom.y}px) scale(${viewZoom.scale})`,transformOrigin:"center"}} title="Scroll over the photo to zoom in or out">
                    <img
                      ref={imageRef}
                      src={src}
                      alt={student.student_name ?? "Photo"}
                      draggable={false}
                      className="block h-auto w-auto max-w-full select-none object-contain"
                      style={{ maxWidth: frameLimit.width, maxHeight: frameLimit.height }}
                      onLoad={() => {
                        paintFrame();
                        paintTone();
                      }}
                    />
                    {cropArmed ? <img ref={toneImageRef} src={src} alt="" aria-hidden draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" onLoad={paintTone} /> : null}
                    {cropArmed ? <div className="pointer-events-none absolute inset-0">
                      <div
                        ref={frameRef}
                        className="absolute"
                        style={{
                          left: 0,
                          top: 0,
                          width: "100%",
                          height: "100%",
                          transformOrigin: "center center",
                          border: "1px solid #ffffff",
                          boxShadow: "0 0 0 1px rgba(30, 27, 75, 0.55), 0 0 0 9999px rgba(49, 46, 129, 0.28)",
                        }}
                      >
                        {HANDLES.map((handle) => (
                          <span
                            key={handle}
                            className="pointer-events-none absolute h-2 w-2 border border-[#6366F1] bg-white"
                            style={handleStyle(handle)}
                          />
                        ))}
                        <span className="pointer-events-none absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 -translate-y-full bg-white" />
                        <span className="pointer-events-none absolute left-1/2 top-0 flex h-6 w-6 -translate-x-1/2 -translate-y-[1.7rem] items-center justify-center rounded-full border border-[#6366F1] bg-white text-[#6366F1] shadow-sm">
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 12a8 8 0 1 1-2.2-5.5" />
                            <path d="M20 4v4h-4" />
                          </svg>
                        </span>
                      </div>
                    </div> : null}
                  </div>
                ) : (
                  <p className="text-sm text-[#64748B]">{student ? "Loading photo…" : "Choose a photo."}</p>
                )}
              </div>
            </div>
            <div className="relative z-10 shrink-0 border-t border-[#E2E8F0] bg-white px-3 py-1.5">
              <button
                ref={toneButtonRef}
                type="button"
                className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-3 text-sm font-semibold ${
                  toneOpen
                    ? "border-[#C4B5FD] bg-[#F5F3FF] text-[#6366F1]"
                    : "border-[#BFDBFE] bg-white text-[#2563EB]"
                }`}
                disabled={!cropArmed || saving}
                aria-expanded={toneOpen}
                onClick={() => setToneOpen((open) => !open)}
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
                Edit
              </button>
              {toneOpen ? (
                <div
                  ref={tonePanelRef}
                  className="absolute bottom-full left-3 z-20 mb-2 w-72 rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-[0_12px_28px_rgba(49,46,129,0.12)]"
                >
                  <label className="flex items-center gap-2 text-xs font-semibold text-[#485989]">
                    <span className="w-[4.6rem] shrink-0">Brightness</span>
                    <input
                      ref={brightnessInputRef}
                      type="range"
                      min={-100}
                      max={100}
                      defaultValue={0}
                      aria-label="Brightness"
                      className="min-w-0 flex-1 accent-[#6366F1]"
                      onInput={(event) => applyTone(Number(event.currentTarget.value), toneRef.current.contrast)}
                      onPointerUp={endToneGesture}
                      onPointerCancel={endToneGesture}
                    />
                    <span ref={brightnessLabelRef} className="w-8 text-right tabular-nums text-[#64748B]">0</span>
                  </label>
                  <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-[#485989]">
                    <span className="w-[4.6rem] shrink-0">Contrast</span>
                    <input
                      ref={contrastInputRef}
                      type="range"
                      min={-100}
                      max={100}
                      defaultValue={0}
                      aria-label="Contrast"
                      className="min-w-0 flex-1 accent-[#6366F1]"
                      onInput={(event) => applyTone(toneRef.current.brightness, Number(event.currentTarget.value))}
                      onPointerUp={endToneGesture}
                      onPointerCancel={endToneGesture}
                    />
                    <span ref={contrastLabelRef} className="w-8 text-right tabular-nums text-[#64748B]">0</span>
                  </label>
                  <button type="button" className="btn-secondary mt-3 px-3 py-1.5 text-sm" onClick={resetTone}>Reset Adjustments</button>
                </div>
              ) : null}
            </div>
            {error ? <p className="bg-white px-3 pb-2 text-sm text-[#DC2626]">{error}</p> : null}
          </div>
        )}
          {!browsing ? <div className="crop-actions crop-actions-bottom" aria-label="Crop actions">
              <button type="button" className="btn-secondary" disabled={saving || applying} onClick={() => { if (canLeaveEditor()) resetWorkspace(); }}>Reset</button>
              <button type="button" className="btn-secondary" disabled={saving || applying} onClick={leaveEditor}>Photos</button>
              {phase === "preview" ? (
                <button type="button" className="btn-secondary" disabled={saving || applying} onClick={() => { if (student) markDirty(student.id); setPhase("edit"); previewBlobRef.current = null; clearPreview(); }}>Edit crop</button>
              ) : (
                <button type="button" className="btn-secondary" disabled={!src || applying || !cropArmed} onClick={() => void applyOk()}>{applying ? "Preparing…" : "OK"}</button>
              )}
              <button type="button" className="btn-primary" disabled={phase !== "preview" || saving} onClick={() => void saveCrop()}>{saving ? "Saving…" : "Save"}</button>
              <button type="button" className="btn-secondary" disabled={saving || applying} onClick={undoCrop}>Undo</button>

          </div> : null}
        </div>
      </div>
    </div>
  );
}

function captureParts(iso: string | null | undefined): { day: string; hour: number } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const hour = Number(read("hour"));
  if (!Number.isFinite(hour)) return null;
  return { day: `${read("year")}-${read("month")}-${read("day")}`, hour };
}

function formatCaptureDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return day;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, date));
}

function formatCaptureHour(hour: number): string {
  const start = new Date(2020, 0, 1, hour);
  const end = new Date(2020, 0, 1, (hour + 1) % 24);
  const label = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
  return `${label.format(start)} – ${label.format(end)}`;
}

const MM_PER_INCH = 25.4;

type CropUnit = "cm" | "in" | "mm";

type SavedCropSize = { width: string; height: string; unit: CropUnit; locked: boolean };

function cropStorageKey(storageKey: string): string {
  return `school-id-crop-size:${storageKey}`;
}

function readCropSize(storageKey: string): SavedCropSize {
  try {
    const parsed = JSON.parse(localStorage.getItem(cropStorageKey(storageKey)) ?? "") as Partial<SavedCropSize>;
    const unit = parsed.unit === "in" || parsed.unit === "mm" || parsed.unit === "cm" ? parsed.unit : "cm";
    return {
      width: typeof parsed.width === "string" ? parsed.width : "",
      height: typeof parsed.height === "string" ? parsed.height : "",
      unit,
      locked: parsed.locked === true,
    };
  } catch {
    return { width: "", height: "", unit: "cm", locked: false };
  }
}

function writeCropSize(storageKey: string, value: SavedCropSize): void {
  localStorage.setItem(cropStorageKey(storageKey), JSON.stringify(value));
}

function toMillimeters(value: number, unit: CropUnit): number {
  if (unit === "mm") return value;
  if (unit === "cm") return value * 10;
  return value * MM_PER_INCH;
}

function isOrganizationCropPhoto(student: Student): boolean {
  return (student.photo_url ?? "").includes("/admin/organizations/");
}

async function loadCropPhoto(student: Student, signal?: AbortSignal, thumb = false): Promise<string> {
  if (!isOrganizationCropPhoto(student)) {
    return (await authenticatedStudentPhotoUrl(student.id, { signal, thumb, version: student.updated_at })) ?? "";
  }
  const { data } = await api.get(student.photo_url!, { responseType: "blob", signal });
  return URL.createObjectURL(data as Blob);
}

function parseMeasure(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot === -1) return cleaned.slice(0, 5);
  const whole = cleaned.slice(0, dot).slice(0, 4);
  const fraction = cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${whole}.${fraction}`;
}

function convertMeasure(raw: string, factor: number): string {
  const value = Number(raw);
  if (!raw || !Number.isFinite(value) || value <= 0) return raw;
  const converted = Math.round(value * factor * 100) / 100;
  return String(converted);
}

/** Keep the aspect ratio and all rotated corners inside the original image. */
function limitCrop(crop: Crop, image: HTMLImageElement | null, limit: {width:number|null;height:number|null}): Crop {
  if (!image?.naturalWidth || !image.naturalHeight) return clampCrop(crop);
  const aspect = image.naturalWidth / image.naturalHeight;
  let w = Math.max(0.001, Math.min(1,crop.w));
  let h = Math.max(0.001, Math.min(1,crop.h));
  if (limit.width && limit.height) {
    const ratio = limit.width / limit.height / aspect;
    if (w / h > ratio) w = h * ratio; else h = w / ratio;
  }
  const angle = crop.angle * Math.PI / 180;
  const c = Math.abs(Math.cos(angle)), t = Math.abs(Math.sin(angle));
  const boundW = c*w + t*h/aspect, boundH = t*w*aspect + c*h;
  const scale = Math.min(1, 1/boundW, 1/boundH);
  w *= scale; h *= scale;
  const halfW = (c*w+t*h/aspect)/2, halfH = (t*w*aspect+c*h)/2;
  return {...crop,w,h,cx:Math.max(halfW,Math.min(1-halfW,crop.cx)),cy:Math.max(halfH,Math.min(1-halfH,crop.cy))};
}

function GalleryThumb({
  student,
  active,
  status,
  large = false,
  onClick,
}: {
  student: Student;
  active: boolean;
  status: "saved" | "editing" | "cropped" | null;
  large?: boolean;
  onClick: () => void;
}) {
  const holder = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState("");
  useEffect(() => {
    const node = holder.current;
    if (!node || !student.photo_url) return;
    let cancelled = false;
    const controller = new AbortController();
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void loadCropPhoto(student, controller.signal, true).then((url) => {
          if (!cancelled && url) setSrc(url);
        }).catch(() => {
          if (!cancelled) setSrc("");
        });
      },
      { root: node.parentElement, rootMargin: "80px" }
    );
    observer.observe(node);
    return () => {
      cancelled = true;
      controller.abort();
      observer.disconnect();
    };
  }, [student.id, student.photo_url, student.photo_captured_at, student.updated_at]);
  return (
    <button
      ref={holder}
      type="button"
      onClick={onClick}
      className={`flex w-full text-left ${
        large ? "flex-col gap-2 rounded-xl border bg-white p-3" : "items-center gap-2 rounded-lg border px-2 py-1.5"
      } ${student.photo_cropped ? "border-[#BBF7D0] bg-[#F0FDF4]" : active ? "border-[#8B5CF6] bg-[#F5F3FF]" : "border-[#E2E8F0]"}`}
    >
      <span className={large ? "relative block h-40 w-full" : "relative block h-11 w-11 shrink-0"}>
        {src ? (
          <img src={src} alt="" className={large ? "h-40 w-full rounded-lg bg-[#F8FAFC] object-contain" : "h-11 w-11 rounded object-cover"} />
        ) : (
          <span className={large ? "block h-40 w-full animate-pulse rounded-lg bg-[#EEF2FF]" : "block h-11 w-11 animate-pulse rounded bg-[#EEF2FF]"} />
        )}
        {large && (status === "cropped" || student.photo_cropped) ? (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-[#16A34A] px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
            <svg className="h-3 w-3" viewBox="0 0 16 16" aria-hidden>
              <path d="M3.5 8.2 6.4 11 12.5 4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Cropped
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-[#485989]">
          {student.photo_id || student.student_name || "Photo"}
        </span>
        {status === "saved" ? (
          <span className="text-[11px] font-semibold text-[#22C55E]">Saved</span>
        ) : status === "editing" ? (
          <span className="text-[11px] font-semibold text-[#F97316]">Editing</span>
        ) : null}
      </span>
    </button>
  );
}

function primaryCategory(categories: ConfiguredCategoryField[]): ConfiguredCategoryField | null {
  return (
    categories.find((field) => field.kind === "class") ??
    categories.find((field) => field.kind === "group") ??
    categories.find((field) => field.kind === "designation") ??
    categories.find((field) => field.kind === "department") ??
    null
  );
}

function categoryValue(student: Student, field: ConfiguredCategoryField): string {
  const extra = student.extra_fields;
  if (extra && typeof extra === "object") {
    const direct = extra[field.key];
    if (direct != null && String(direct).trim()) return String(direct).trim();
  }
  const shown = studentFieldDisplay(student, field.key, field.label).trim();
  if (shown && shown !== "—") return shown;
  if (field.kind === "class" && student.class_section?.trim()) return student.class_section.trim();
  return "";
}

function hitTest(clientX: number, clientY: number, crop: Crop, box: DOMRect): Hit | null {
  const px = clientX - box.left;
  const py = clientY - box.top;
  const cx = crop.cx * box.width;
  const cy = crop.cy * box.height;
  const hw = (crop.w * box.width) / 2;
  const hh = (crop.h * box.height) / 2;
  const spots: Array<[Hit, number, number]> = [
    ["rotate", 0, -hh - 28],
    ["nw", -hw, -hh],
    ["n", 0, -hh],
    ["ne", hw, -hh],
    ["e", hw, 0],
    ["se", hw, hh],
    ["s", 0, hh],
    ["sw", -hw, hh],
    ["w", -hw, 0],
  ];
  for (const [hit, ox, oy] of spots) {
    const world = rotatePoint(ox, oy, crop.angle);
    const reach = hit === "rotate" ? 16 : 12;
    if (Math.hypot(px - (cx + world.x), py - (cy + world.y)) <= reach) return hit;
  }
  const local = unrotatePoint(px - cx, py - cy, crop.angle);
  if (Math.abs(local.x) <= hw && Math.abs(local.y) <= hh) return "move";
  return null;
}

function pointerAngle(clientX: number, clientY: number, crop: Crop, box: DOMRect): number {
  const cx = box.left + crop.cx * box.width;
  const cy = box.top + crop.cy * box.height;
  return Math.atan2(clientX - cx, cy - clientY);
}

function angleDelta(next: number, start: number): number {
  let delta = next - start;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function rotatePoint(x: number, y: number, degrees: number): { x: number; y: number } {
  const t = (degrees * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: x * c - y * s, y: x * s + y * c };
}

function unrotatePoint(x: number, y: number, degrees: number): { x: number; y: number } {
  return rotatePoint(x, y, -degrees);
}

function resizeCrop(origin: Crop, handle: Handle, dx: number, dy: number, imageAspect: number): Crop {
  const physical = unrotatePoint(dx * imageAspect, dy, origin.angle);
  const local = {x: physical.x / imageAspect, y: physical.y};
  const east = handle === "e" || handle === "ne" || handle === "se";
  const west = handle === "w" || handle === "nw" || handle === "sw";
  const north = handle === "n" || handle === "ne" || handle === "nw";
  const south = handle === "s" || handle === "se" || handle === "sw";
  let dw = 0;
  let dh = 0;
  let sx = 0;
  let sy = 0;
  if (east) {
    dw += local.x;
    sx += local.x / 2;
  }
  if (west) {
    dw -= local.x;
    sx += local.x / 2;
  }
  if (south) {
    dh += local.y;
    sy += local.y / 2;
  }
  if (north) {
    dh -= local.y;
    sy += local.y / 2;
  }
  const physicalShift = rotatePoint(sx * imageAspect, sy, origin.angle);
  const shift = {x:physicalShift.x / imageAspect,y:physicalShift.y};
  return {
    ...origin,
    cx: origin.cx + shift.x,
    cy: origin.cy + shift.y,
    w: origin.w + dw,
    h: origin.h + dh,
  };
}

function clampCrop(crop: Crop): Crop {
  const w = Math.min(1, Math.max(MIN_SIZE, crop.w));
  const h = Math.min(1, Math.max(MIN_SIZE, crop.h));
  return {
    ...crop,
    w,
    h,
    cx: Math.min(1 - w / 2, Math.max(w / 2, crop.cx)),
    cy: Math.min(1 - h / 2, Math.max(h / 2, crop.cy)),
  };
}

function handleStyle(handle: Handle): { left: string; top: string; transform: string } {
  const pos: Record<Handle, { left: string; top: string }> = {
    nw: { left: "0%", top: "0%" },
    n: { left: "50%", top: "0%" },
    ne: { left: "100%", top: "0%" },
    e: { left: "100%", top: "50%" },
    se: { left: "100%", top: "100%" },
    s: { left: "50%", top: "100%" },
    sw: { left: "0%", top: "100%" },
    w: { left: "0%", top: "50%" },
  };
  return { ...pos[handle], transform: "translate(-50%, -50%)" };
}

function cursorFor(hit: Hit | null): string {
  if (hit === "rotate") return "grab";
  if (hit === "move") return "move";
  if (hit === "n" || hit === "s") return "ns-resize";
  if (hit === "e" || hit === "w") return "ew-resize";
  if (hit === "nw" || hit === "se") return "nwse-resize";
  if (hit === "ne" || hit === "sw") return "nesw-resize";
  return "default";
}

function toneFilter(brightness: number, contrast: number): string {
  if (brightness === 0 && contrast === 0) return "none";
  return `brightness(${1 + brightness / 100}) contrast(${1 + contrast / 100})`;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(min, value));
}

function adjustedSource(
  image: HTMLImageElement,
  tone: { brightness: number; contrast: number }
): CanvasImageSource {
  if (tone.brightness === 0 && tone.contrast === 0) return image;
  const source = document.createElement("canvas");
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const ctx = source.getContext("2d");
  if (!ctx) return image;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, source.width, source.height);
  const data = pixels.data;
  const bright = 1 + tone.brightness / 100;
  const slope = 1 + tone.contrast / 100;
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      let value = data[index + channel] / 255;
      value = (value * bright - 0.5) * slope + 0.5;
      data[index + channel] = Math.max(0, Math.min(255, Math.round(value * 255)));
    }
  }
  ctx.putImageData(pixels, 0, 0);
  return source;
}

function renderCrop(
  image: HTMLImageElement,
  crop: Crop,
  tone: { brightness: number; contrast: number },
  size: { width: number; height: number }
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const output = document.createElement("canvas");
    const measured = size.width > 0 && size.height > 0;
    const outputWidth = Math.max(1, Math.round(measured ? size.width / 25.4 * 300 : crop.w * width));
    const outputHeight = Math.max(1, Math.round(measured ? size.height / 25.4 * 300 : crop.h * height));
    if (outputWidth > 8192 || outputHeight > 8192) {
      reject(new Error("Crop dimensions exceed 8192 pixels at 300 DPI"));
      return;
    }
    output.width = outputWidth; output.height = outputHeight;
    const ctx = output.getContext("2d");
    if (!ctx) {
      reject(new Error("Canvas is unavailable"));
      return;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.translate(output.width / 2, output.height / 2);
    const scale = Math.min(output.width / (crop.w * width), output.height / (crop.h * height));
    ctx.scale(scale, scale);
    ctx.rotate((-crop.angle * Math.PI) / 180);
    ctx.translate(-crop.cx * width, -crop.cy * height);
    const filter = toneFilter(tone.brightness, tone.contrast);
    let drew = false;
    if (filter !== "none") {
      try {
        ctx.filter = filter;
        drew = ctx.filter !== "none" && ctx.filter !== "";
      } catch {
        drew = false;
      }
    }
    if (drew) {
      ctx.drawImage(image, 0, 0);
      ctx.filter = "none";
    } else {
      ctx.filter = "none";
      ctx.drawImage(adjustedSource(image, tone), 0, 0);
    }
    output.toBlob(async (blob) => {
      if (!blob) { reject(new Error("Could not encode the photo")); return; }
      try {
        // Canvas defaults to 96 DPI. Store the actual physical print density in JFIF.
        const bytes = new Uint8Array(await blob.arrayBuffer());
        for (let i = 2; i + 16 < bytes.length;) {
          if (bytes[i] !== 255 || bytes[i + 1] === 218) break;
          const length = bytes[i + 2] * 256 + bytes[i + 3];
          if (bytes[i + 1] === 224 && String.fromCharCode(...bytes.slice(i + 4, i + 9)) === "JFIF\0") {
            bytes[i + 11] = 1;
            bytes[i + 12] = bytes[i + 14] = 1;
            bytes[i + 13] = bytes[i + 15] = 44;
            break;
          }
          if (length < 2) break;
          i += length + 2;
        }
        resolve(new Blob([bytes], { type: "image/jpeg" }));
      } catch (error) { reject(error); }
    }, "image/jpeg", 0.95);
  });
}
