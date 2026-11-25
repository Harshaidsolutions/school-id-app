/** Component tests only (React Native via jest-expo). Pure-logic unit tests run on
 *  Node's built-in runner via `npm test`. Run these with `npm run test:component`. */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/tests/component/**/*.test.tsx"],
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))",
  ],
};
