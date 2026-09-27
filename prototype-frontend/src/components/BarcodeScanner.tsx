import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { CameraOff, RefreshCw, Flashlight } from 'lucide-react';
import { Modal } from './Modal';

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string, format: string) => void;
  /** Title untuk header modal */
  title?: string;
  /** Hint text di tengah preview */
  hint?: string;
}

/**
 * Camera-based barcode scanner menggunakan @zxing/browser.
 *
 * Features:
 * - Live camera preview dengan overlay box untuk aiming
 * - Auto-decode multi-format (EAN-13, Code 128, QR Code, dll)
 * - Torch toggle (jika device support)
 * - Camera switch (front/back) untuk tablet/phone
 * - Fallback ke manual entry jika camera unavailable
 * - Sound feedback (beep) saat berhasil scan
 * - Anti-duplicate: cooldown 1.5 detik setelah scan sukses
 */
export function BarcodeScanner({
  open,
  onClose,
  onDetected,
  title = 'Scan Barcode',
  hint = 'Arahkan kamera ke barcode produk',
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<'idle' | 'granted' | 'denied' | 'unsupported'>('idle');
  const [cameras, setCameras] = useState<{ deviceId: string; label: string }[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | undefined>(undefined);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [manualEntry, setManualEntry] = useState('');
  const lastDetectedRef = useRef<{ code: string; ts: number } | null>(null);

  // Stop scanner on close
  const stop = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    setError(null);

    // Check browser support
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission('unsupported');
      setError('Browser tidak mendukung camera API. Gunakan input manual.');
      return;
    }

    let cancelled = false;

    const initialize = async () => {
      try {
        // Get permission and enumerate devices
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        setPermission('granted');

        // Enumerate cameras (after permission granted)
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const cams = devices
          .filter(d => d.deviceId)
          .map(d => ({ deviceId: d.deviceId, label: d.label || 'Camera' }));
        setCameras(cams);

        // Prefer back camera (environment)
        const backCam = cams.find(c => /back|rear|environment/i.test(c.label)) || cams[0];
        setActiveDeviceId(backCam?.deviceId);

        // Setup hints: support common product barcode formats
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.QR_CODE,
          BarcodeFormat.ITF,
        ]);

        // Start scanner
        const reader = new BrowserMultiFormatReader(hints);
        if (videoRef.current) {
          const controls = await reader.decodeFromVideoDevice(
            backCam?.deviceId,
            videoRef.current,
            (result, err) => {
              if (cancelled || !result) return;
              const code = result.getText();
              const format = result.getBarcodeFormat().toString();

              // Anti-duplicate: ignore same code within 1.5s
              const now = Date.now();
              if (lastDetectedRef.current?.code === code && now - lastDetectedRef.current.ts < 1500) {
                return;
              }
              lastDetectedRef.current = { code, ts: now };

              // Beep feedback
              try {
                const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                gain.gain.value = 0.1;
                osc.frequency.value = 1500;
                osc.start();
                osc.stop(audioCtx.currentTime + 0.08);
              } catch { /* audio feedback optional */ }

              onDetected(code, format);
            }
          );
          controlsRef.current = controls;

          // Check torch support (after stream attached)
          const track = stream.getVideoTracks()[0] as any;
          if (track && track.getCapabilities && typeof track.getCapabilities === 'function') {
            const caps = track.getCapabilities();
            setHasTorch(!!caps.torch);
          }

          // Stop the temporary permission stream — the actual reader has its own
          stream.getTracks().forEach(t => t.stop());
        }
      } catch (e: any) {
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          setPermission('denied');
          setError('Akses kamera ditolak. Mohon izinkan kamera di pengaturan browser, atau gunakan input manual.');
        } else if (e.name === 'NotFoundError') {
          setPermission('unsupported');
          setError('Tidak ada camera terdeteksi di device ini. Gunakan input manual.');
        } else {
          setError('Error accessing camera: ' + (e.message || e.name));
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
      stop();
    };
  }, [open, stop, onDetected]);

  // Switch camera (front <-> back)
  async function switchCamera() {
    if (cameras.length < 2) return;
    stop();
    const idx = cameras.findIndex(c => c.deviceId === activeDeviceId);
    const next = cameras[(idx + 1) % cameras.length];
    setActiveDeviceId(next.deviceId);

    // Restart reader with new device
    const reader = new BrowserMultiFormatReader();
    if (videoRef.current) {
      const controls = await reader.decodeFromVideoDevice(
        next.deviceId,
        videoRef.current,
        (result, err) => {
          if (!result) return;
          const code = result.getText();
          const format = result.getBarcodeFormat().toString();
          const now = Date.now();
          if (lastDetectedRef.current?.code === code && now - lastDetectedRef.current.ts < 1500) {
            return;
          }
          lastDetectedRef.current = { code, ts: now };
          onDetected(code, format);
        }
      );
      controlsRef.current = controls;
    }
  }

  // Toggle torch
  async function toggleTorch() {
    if (!hasTorch || !videoRef.current) return;
    const track = (videoRef.current.srcObject as MediaStream)?.getVideoTracks()[0] as any;
    if (!track || !track.getCapabilities) return;

    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn(!torchOn);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  }

  // Manual entry fallback
  function submitManual() {
    const code = manualEntry.trim();
    if (code.length >= 4) {
      onDetected(code, 'MANUAL');
      setManualEntry('');
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { stop(); onClose(); }}
      title={title}
      description={hint}
      size="lg"
    >
      <div className="space-y-3">
        {/* Camera preview area */}
        <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '4/3' }}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
            autoPlay
          />

          {/* Scanning overlay */}
          {permission === 'granted' && !error && (
            <>
              {/* Darkened edges + transparent center window */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 border-2 border-white/80" style={{
                  clipPath: 'polygon(0% 0%, 0% 100%, 15% 100%, 15% 25%, 85% 25%, 85% 75%, 15% 75%, 15% 100%, 100% 100%, 100% 0%)',
                }}></div>
              </div>

              {/* Corner brackets */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-[15%] w-8 h-8 border-t-4 border-l-4 border-green-400"></div>
                <div className="absolute top-1/4 right-[15%] w-8 h-8 border-t-4 border-r-4 border-green-400"></div>
                <div className="absolute bottom-1/4 left-[15%] w-8 h-8 border-b-4 border-l-4 border-green-400"></div>
                <div className="absolute bottom-1/4 right-[15%] w-8 h-8 border-b-4 border-r-4 border-green-400"></div>
              </div>

              {/* Hint text */}
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <p className="text-white/90 text-sm bg-black/40 inline-block px-3 py-1 rounded">
                  Posisikan barcode dalam kotak hijau
                </p>
              </div>
            </>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
              <div className="text-center text-white p-4 max-w-xs">
                <CameraOff className="w-8 h-8 mx-auto mb-2 text-white/70" aria-hidden="true" />
                <p className="text-sm mb-3">{error}</p>
                <p className="text-xs text-white/60">Gunakan input manual di bawah.</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls row */}
        <div className="flex gap-2 items-center">
          {/* Camera switch */}
          {cameras.length > 1 && permission === 'granted' && !error && (
            <button
              type="button"
              onClick={switchCamera}
              className="btn btn-secondary flex-1 text-sm"
              title="Switch camera"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Ganti Kamera
            </button>
          )}

          {/* Torch toggle */}
          {hasTorch && permission === 'granted' && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`btn flex-1 text-sm ${torchOn ? 'btn-primary' : 'btn-secondary'}`}
              title="Toggle torch"
            >
              <Flashlight className="w-4 h-4" aria-hidden="true" />
              {torchOn ? 'Senter Nyala' : 'Senter'}
            </button>
          )}
        </div>

        {/* Manual entry fallback */}
        <div className="border-t pt-3">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Input manual (jika kamera tidak tersedia):
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1"
              placeholder="Ketik barcode (min 4 karakter)"
              value={manualEntry}
              onChange={(e) => setManualEntry(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && submitManual()}
              autoFocus={permission === 'denied' || permission === 'unsupported'}
            />
            <button
              type="button"
              onClick={submitManual}
              disabled={manualEntry.trim().length < 4}
              className="btn btn-primary"
            >
              Submit
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Format: EAN-13, Code 128, atau manual entry. Min 4 karakter.
          </p>
        </div>
      </div>
    </Modal>
  );
}
