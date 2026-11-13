import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import {
  PanGestureHandler,
  PinchGestureHandler,
  State,
  TapGestureHandler,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
  type PinchGestureHandlerGestureEvent,
  type PinchGestureHandlerStateChangeEvent,
  type TapGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { Image, type ImageSource } from "expo-image";

const MIN = 1;
const MAX = 5;
const DOUBLE_TAP = 2.5;

/**
 * A picture that can be zoomed: pinch with two fingers, double-tap to zoom in / out,
 * drag to move around while zoomed. `onZoomChange(true)` while zoomed lets a gallery
 * stop swiping to the next picture.
 */
export function ZoomableImage({ source, onZoomChange }: { source: ImageSource; onZoomChange?: (zoomed: boolean) => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const s = useRef(1);
  const base = useRef(1);
  const pan = useRef({ x: 0, y: 0, bx: 0, by: 0 });
  const zoomed = useRef(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const pinchRef = useRef<PinchGestureHandler>(null);
  const panRef = useRef<PanGestureHandler>(null);
  const doubleRef = useRef<TapGestureHandler>(null);

  const report = useCallback(
    (v: number) => {
      const z = v > 1.02;
      if (z !== zoomed.current) {
        zoomed.current = z;
        setIsZoomed(z);
        onZoomChange?.(z);
      }
    },
    [onZoomChange]
  );

  const setScale = useCallback(
    (v: number, animate = false) => {
      const next = Math.min(MAX, Math.max(MIN, v));
      s.current = next;
      base.current = next;
      if (next <= 1.02) {
        pan.current = { x: 0, y: 0, bx: 0, by: 0 };
        if (animate) {
          Animated.parallel([
            Animated.timing(scale, { toValue: 1, duration: 180, useNativeDriver: false }),
            Animated.timing(tx, { toValue: 0, duration: 180, useNativeDriver: false }),
            Animated.timing(ty, { toValue: 0, duration: 180, useNativeDriver: false }),
          ]).start();
        } else {
          scale.setValue(1);
          tx.setValue(0);
          ty.setValue(0);
        }
        s.current = 1;
        base.current = 1;
      } else if (animate) {
        Animated.timing(scale, { toValue: next, duration: 180, useNativeDriver: false }).start();
      } else {
        scale.setValue(next);
      }
      report(s.current);
    },
    [report, scale, tx, ty]
  );

  // A new picture always starts un-zoomed.
  const key = typeof source === "object" && source && "uri" in source ? source.uri : "";
  useEffect(() => { setScale(1); }, [key, setScale]);

  const onPinch = (e: PinchGestureHandlerGestureEvent) => {
    const next = Math.min(MAX, Math.max(MIN, base.current * e.nativeEvent.scale));
    s.current = next;
    scale.setValue(next);
  };
  const onPinchState = (e: PinchGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.BEGAN) base.current = s.current;
    if (e.nativeEvent.oldState === State.ACTIVE) setScale(base.current * e.nativeEvent.scale);
  };
  const onPan = (e: PanGestureHandlerGestureEvent) => {
    if (s.current <= 1.02) return;
    tx.setValue(pan.current.bx + e.nativeEvent.translationX);
    ty.setValue(pan.current.by + e.nativeEvent.translationY);
  };
  const onPanState = (e: PanGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state === State.BEGAN) {
      pan.current.bx = pan.current.x;
      pan.current.by = pan.current.y;
    }
    if (e.nativeEvent.oldState === State.ACTIVE && s.current > 1.02) {
      pan.current.x = pan.current.bx + e.nativeEvent.translationX;
      pan.current.y = pan.current.by + e.nativeEvent.translationY;
    }
  };
  const onDouble = (e: TapGestureHandlerStateChangeEvent) => {
    if (e.nativeEvent.state !== State.ACTIVE) return;
    setScale(s.current > 1.02 ? 1 : DOUBLE_TAP, true);
  };

  return (
    <TapGestureHandler ref={doubleRef} numberOfTaps={2} onHandlerStateChange={onDouble}>
      <Animated.View style={st.fill}>
        <PanGestureHandler
          ref={panRef}
          simultaneousHandlers={pinchRef}
          minPointers={1}
          maxPointers={2}
          activeOffsetX={[-6, 6]}
          activeOffsetY={[-6, 6]}
          enabled={isZoomed}
          onGestureEvent={onPan}
          onHandlerStateChange={onPanState}
        >
          <Animated.View style={st.fill}>
            <PinchGestureHandler ref={pinchRef} simultaneousHandlers={panRef} onGestureEvent={onPinch} onHandlerStateChange={onPinchState}>
              <Animated.View style={[st.fill, { transform: [{ translateX: tx }, { translateY: ty }, { scale }] }]}>
                <View style={st.fill} pointerEvents="none">
                  <Image source={source} style={st.fill} contentFit="contain" transition={150} />
                </View>
              </Animated.View>
            </PinchGestureHandler>
          </Animated.View>
        </PanGestureHandler>
      </Animated.View>
    </TapGestureHandler>
  );
}

const st = StyleSheet.create({ fill: { flex: 1, width: "100%", height: "100%" } });
