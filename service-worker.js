(function(){var e={fontFamily:`system-ui, "Segoe UI", Roboto, Tahoma, Arial, sans-serif`,fontSize:22,fontWeight:600,textColor:`#ffffff`,backgroundColor:`#000000`,backgroundOpacity:.65,textShadow:!1,outlineColor:`#000000`,outlineWidth:0,lineHeight:1.35,letterSpacing:0,alignment:`center`,direction:`auto`},t={...e,fontSize:20,fontWeight:500,textColor:`#55d6be`};function n(){return{version:1,enabled:!0,uiLanguage:`auto`,theme:`system`,primaryLanguage:`en`,secondaryLanguage:`de`,primary:{...e},secondary:{...t},position:{preset:`bottom`,offsetPercent:10,lineGapPx:6,maxWidthPercent:80},timing:{primaryOffsetMs:0,secondaryOffsetMs:0},learning:{shortcuts:!0,shortcutCodes:{previous:`KeyA`,next:`KeyD`,replay:`KeyS`,loop:`KeyR`},wordLookup:!0,slowLoopRate:1},debug:!1}}var r=`polylingo.settings`;chrome.runtime.onInstalled.addListener(e=>{e.reason===`install`&&chrome.storage.sync.get(r).then(async e=>{e[`polylingo.settings`]===void 0&&await chrome.storage.sync.set({[r]:n()})})})})();
// [PolyLingo 0.6] Browser-level shortcuts (chrome.commands) are forwarded to the YouTube tab.
// The listener must be registered synchronously at the top level of the service worker.
chrome.commands.onCommand.addListener((command, tab) => {
  if (typeof tab?.id !== 'number') return;
  chrome.tabs.sendMessage(tab.id, { type: 'polylingo/command', command }).catch(() => {});
});
