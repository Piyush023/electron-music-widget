/**
 * Previously patched LSUIElement = YES into Electron's Info.plist to try to
 * show the menu bar icon on macOS 26. That flag removes the app from the Dock,
 * which broke the only reliable entry point on macOS 26 where status bar items
 * from unsigned apps are hidden in the new Control Centre overflow.
 *
 * Patch is now a no-op. The app relies on:
 *   1. Dock icon (always works)  — click to toggle the player popover
 *   2. Tray / menu bar icon      — visible when macOS 26 makes it accessible
 */
console.log('[patch-plist] Nothing to patch.');
