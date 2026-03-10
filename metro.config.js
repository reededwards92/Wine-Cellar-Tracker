const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /\.local\/.*/,
];

config.watcher = {
  ...config.watcher,
  additionalExts: config.watcher?.additionalExts || [],
};

module.exports = config;
