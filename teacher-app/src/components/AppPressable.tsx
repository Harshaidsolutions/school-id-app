import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, type PressableProps } from "react-native";
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Layout-preserving touch feedback; respects the phone's Reduce Motion setting. */
export function AppPressable({ style, android_ripple, onPressIn, onPressOut, ...rest }: PressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const [reduceMotion,setReduceMotion] = useState(true);
  useEffect(()=>{
    let active=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(active)setReduceMotion(value);}).catch(()=>{});
    const subscription=AccessibilityInfo.addEventListener("reduceMotionChanged",setReduceMotion);
    return()=>{active=false;subscription.remove();scale.stopAnimation();};
  },[scale]);
  useEffect(()=>{if(reduceMotion){scale.stopAnimation();scale.setValue(1);}},[reduceMotion,scale]);
  function animate(value:number) {
    if(reduceMotion){scale.setValue(1);return;}
    Animated.spring(scale,{toValue:value,useNativeDriver:true,speed:32,bounciness:0}).start();
  }
  return <AnimatedPressable {...rest} android_ripple={android_ripple ?? null}
    onPressIn={event=>{animate(.975);onPressIn?.(event);}}
    onPressOut={event=>{animate(1);onPressOut?.(event);}}
    style={state=>{
      const base=typeof style === "function"?style(state):style;
      const flattened=StyleSheet.flatten(base);
      return [base,{transform:[...(Array.isArray(flattened?.transform)?flattened.transform:[]),{scale}]},state.pressed?{opacity:.9}:null];
    }} />;
}
