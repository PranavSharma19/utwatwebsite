import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/**
 * Rear camera into a <video>, frames onto an offscreen canvas, jsqr on each
 * frame. Calls onDecode(text) on every successful read; the caller owns
 * debouncing. Not unit-tested: it is all browser APIs jsdom lacks. Kept
 * deliberately small so a dry run on a real phone is the test.
 */
export function useQrScanner({ enabled, onDecode }) {
  const videoRef = useRef(null);
  const onDecodeRef = useRef(onDecode);
  const [error, setError] = useState('');

  // Keep the latest onDecode without re-running the camera effect below on
  // every render (it would restart the stream each time the caller's
  // callback identity changes). Assigning during render trips
  // react-hooks/refs, so it happens here instead -- useLayoutEffect (not
  // useEffect) so the write flushes synchronously right after commit,
  // before paint/rAF, keeping a requestAnimationFrame tick from ever
  // running against a stale closure.
  useLayoutEffect(() => {
    onDecodeRef.current = onDecode;
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const video = videoRef.current;
    if (!video || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open the camera. Use the name lookup.');
      return undefined;
    }

    let stream;
    let frame;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      if (stopped) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height, {
          inversionAttempts: 'dontInvert',
        });
        if (code?.data) onDecodeRef.current(code.data);
      }
      frame = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        video.srcObject = s;
        video.setAttribute('playsinline', 'true');
        return video.play().then(() => {
          frame = requestAnimationFrame(tick);
        });
      })
      .catch((err) => {
        setError(err?.message || 'Camera permission was refused.');
      });

    return () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [enabled]);

  return { videoRef, error };
}
