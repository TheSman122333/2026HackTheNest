import type { AvatarPhoto } from './AvatarCamera.types';
export type { AvatarPhoto } from './AvatarCamera.types';

let selecting = false;
export const isSupported = () => typeof document !== 'undefined' && typeof window !== 'undefined';

/** The browser's own camera/picker, followed by local-only resizing. */
function select(capture: boolean): Promise<AvatarPhoto | null> {
  if (!isSupported()) return Promise.reject(new Error('Photo capture is unavailable in this browser.'));
  if (selecting) return Promise.reject(new Error('Finish the current photo selection first.'));
  selecting = true;
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'user');
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    input.setAttribute('aria-hidden', 'true');
    let settled = false;
    let processing = false;
    let lostFocus = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    let imageUrl: string | null = null;
    const cleanup = () => {
      if (focusTimer) clearTimeout(focusTimer);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      input.remove();
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      selecting = false;
    };
    const finish = (photo: AvatarPhoto | null, error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error); else resolve(photo);
    };
    const blur = () => { lostFocus = true; };
    const focus = () => {
      if (!lostFocus) return;
      // Older browsers omit the file input's cancel event. Let change arrive first.
      focusTimer = setTimeout(() => { if (!processing && !input.files?.length) finish(null); }, 1200);
    };
    input.addEventListener('cancel', () => finish(null), { once: true });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) { finish(null); return; }
      processing = true;
      if (file.size > 20 * 1024 * 1024) { finish(null, new Error('Choose a photo smaller than 20 MB.')); return; }
      if (file.type && !file.type.startsWith('image/')) { finish(null, new Error('Please choose an image.')); return; }
      const image = new Image();
      image.onload = () => {
        try {
          if (!image.naturalWidth || !image.naturalHeight) throw new Error('The selected image could not be read.');
          const ratio = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
          const width = Math.max(1, Math.round(image.naturalWidth * ratio));
          const height = Math.max(1, Math.round(image.naturalHeight * ratio));
          const canvas = document.createElement('canvas');
          canvas.width = width; canvas.height = height;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Your browser could not prepare this photo.');
          context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);
          finish({ uri: canvas.toDataURL('image/jpeg', 0.85), width, height });
        } catch (error) { finish(null, error instanceof Error ? error : new Error('The photo could not be prepared.')); }
      };
      image.onerror = () => finish(null, new Error('This image format could not be opened. Try a JPEG or PNG photo.'));
      imageUrl = URL.createObjectURL(file);
      image.src = imageUrl;
    }, { once: true });
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    document.body.appendChild(input);
    try { input.click(); } catch { finish(null, new Error('The photo picker could not be opened.')); }
  });
}
export const takePhoto = () => select(true);
export const choosePhoto = () => select(false);
export default { isSupported, takePhoto, choosePhoto };
