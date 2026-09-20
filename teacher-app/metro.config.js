const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const FORCE_LIB = {
  "react-native-vision-camera": path.resolve(
    __dirname,
    "node_modules/react-native-vision-camera/lib/index.js"
  ),
  "react-native-vision-camera-face-detector": path.resolve(
    __dirname,
    "node_modules/react-native-vision-camera-face-detector/lib/module/index.js"
  ),
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const forced = FORCE_LIB[moduleName];
  if (forced) {
    return { type: "sourceFile", filePath: forced };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
