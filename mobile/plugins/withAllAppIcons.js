const { withXcodeProject } = require("expo/config-plugins");

/**
 * Turn on "Include All App Icon Assets" for the app itself.
 *
 * expo-alternate-app-icons names the alternate icon sets
 * (ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES) and stops there. On iOS 18
 * and 26, setAlternateIconName then fails with NSPOSIXErrorDomain 35,
 * "Resource temporarily unavailable", from LSIconAlertManager, and Apple's
 * developer support gives two conditions for it to work: the names must match
 * the sets exactly, and this setting must be on. Build 24 had every icon in
 * its asset catalog and Info.plist, and no icon would set.
 *
 * Only on the configurations that name an app icon, which is the app and not
 * the widget extension: an extension has no app icon to include.
 */
module.exports = function withAllAppIcons(config) {
  return withXcodeProject(config, (cfg) => {
    const configs = cfg.modResults.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
      const settings = configs[key] && configs[key].buildSettings;
      if (settings && settings.ASSETCATALOG_COMPILER_APPICON_NAME) {
        settings.ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = "YES";
      }
    }
    return cfg;
  });
};
