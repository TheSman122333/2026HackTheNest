# Avatar camera

A dependency-free Expo local module for user-initiated avatar photos. Import the named functions from `modules/avatar-camera`:

```ts
type AvatarPhoto = { uri: string; width: number; height: number };
takePhoto(): Promise<AvatarPhoto | null>;
choosePhoto(): Promise<AvatarPhoto | null>;
isSupported(): boolean;
```

Cancel returns `null`. A second simultaneous request rejects. Errors include an actionable message. Results are orientation-corrected JPEGs no larger than 1024 pixels on the longest edge, with metadata stripped. Selected files larger than 20 MB are rejected. The caller should copy a native cache file into private persistent storage when saving an avatar. Browser results are data URLs for local persistence.

Android delegates to the installed camera and document picker, grants access only to a temporary cache file, and requires no app camera/gallery permission. iOS uses the system camera with a user-initiated camera permission and the privacy-preserving system photo picker. Set `ios.infoPlist.NSCameraUsageDescription` in `app.json`. Web uses a file input with the user-facing camera hint; whether a camera opens depends on the browser/device.

No image is uploaded or sent to AI. Resizing and format conversion happen locally. The module does not save photos to the system photo library.

Native changes require a new development build (`npx expo run:android --device` / `npx expo run:ios`). Expo Go cannot load this local module. Normal Expo autolinking discovers it from the mobile app's `modules` directory.
