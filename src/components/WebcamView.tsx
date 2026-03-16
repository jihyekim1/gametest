'use client';

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import Webcam from 'react-webcam';
import { initPoseLandmarker } from '@/lib/mediapipe';
import type { Landmark } from '@/types';

// Arm landmark indices (MediaPipe convention)
const LEFT_ARM = [11, 13, 15];
const RIGHT_ARM = [12, 14, 16];

function isVisible(lm: Landmark): boolean {
  return (lm.visibility ?? 1) > 0.4;
}

interface WebcamViewProps {
  onPoseUpdate?: (landmarks: Landmark[]) => void;
  onReady?: () => void;
  onError?: (msg: string) => void;
  /** Overlay content rendered on top of webcam */
  children?: React.ReactNode;
  className?: string;
}

export interface WebcamViewHandle {
  isReady: boolean;
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  w: number,
  h: number,
) {
  // Convert landmark normalized coords to mirrored canvas coords
  const cx = (lm: Landmark) => (1 - lm.x) * w;
  const cy = (lm: Landmark) => lm.y * h;

  const drawArm = (indices: number[], color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < indices.length - 1; i++) {
      const from = landmarks[indices[i]];
      const to = landmarks[indices[i + 1]];
      if (!isVisible(from) || !isVisible(to)) continue;
      ctx.beginPath();
      ctx.moveTo(cx(from), cy(from));
      ctx.lineTo(cx(to), cy(to));
      ctx.stroke();
    }

    // Joints
    indices.forEach((idx) => {
      const lm = landmarks[idx];
      if (!isVisible(lm)) return;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx(lm), cy(lm), 9, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  };

  drawArm(LEFT_ARM, '#3b82f6');
  drawArm(RIGHT_ARM, '#f59e0b');
}

const WebcamView = forwardRef<WebcamViewHandle, WebcamViewProps>(
  function WebcamView(
    { onPoseUpdate, onReady, onError, children, className = '' },
    ref,
  ) {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>(0);
    const landmarkerRef = useRef<Awaited<
      ReturnType<typeof initPoseLandmarker>
    > | null>(null);
    const lastVideoTimeRef = useRef<number>(-1);

    const [status, setStatus] = useState<
      'loading' | 'ready' | 'error' | 'denied'
    >('loading');
    const [isReady, setIsReady] = useState(false);

    useImperativeHandle(ref, () => ({ isReady }));

    // Initialize MediaPipe once
    useEffect(() => {
      let cancelled = false;
      (async () => {
        try {
          landmarkerRef.current = await initPoseLandmarker();
          if (!cancelled) {
            setStatus('ready');
          }
        } catch (e) {
          if (!cancelled) {
            console.error('MediaPipe init failed', e);
            setStatus('error');
            onError?.('포즈 인식 모델을 불러오는 데 실패했어요.');
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [onError]);

    // Pose detection loop — only runs after landmarker is ready
    const detect = useCallback(() => {
      const video = webcamRef.current?.video;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;

      if (!video || !canvas || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      // Sync canvas size to video element
      if (
        canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight
      ) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      // Avoid duplicate timestamps
      if (video.currentTime === lastVideoTimeRef.current) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }
      lastVideoTimeRef.current = video.currentTime;

      // Mark as ready on first successful frame
      if (!isReady) {
        setIsReady(true);
        onReady?.();
      }

      const results = landmarker.detectForVideo(video, performance.now());
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.landmarks.length > 0) {
        const lms = results.landmarks[0] as Landmark[];
        drawSkeleton(ctx, lms, canvas.width, canvas.height);
        onPoseUpdate?.(lms);
      }

      rafRef.current = requestAnimationFrame(detect);
    }, [isReady, onPoseUpdate, onReady]);

    // Start/stop the detection loop
    useEffect(() => {
      if (status !== 'ready') return;
      rafRef.current = requestAnimationFrame(detect);
      return () => cancelAnimationFrame(rafRef.current);
    }, [status, detect]);

    const handleUserMediaError = useCallback(() => {
      setStatus('denied');
      onError?.('웹캠 권한이 거부되었어요. 브라우저 설정에서 카메라 접근을 허용해 주세요.');
    }, [onError]);

    return (
      <div className={`relative bg-black overflow-hidden ${className}`}>
        {/* Webcam video (mirrored for selfie mode) */}
        <Webcam
          ref={webcamRef}
          mirrored
          audio={false}
          onUserMediaError={handleUserMediaError}
          videoConstraints={{ facingMode: 'user', width: 1280, height: 720 }}
          className="w-full h-full object-cover"
        />

        {/* Pose skeleton canvas — draws at (1-x)*w to match mirrored video */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
        />

        {/* Loading overlay */}
        {status === 'loading' && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-white text-xl font-bold">웹캠을 준비 중이에요 📷</p>
            <p className="text-white/70 text-sm">잠깐만 기다려 주세요!</p>
          </div>
        )}

        {/* Error overlay */}
        {(status === 'error' || status === 'denied') && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-4 p-6">
            <span className="text-6xl">
              {status === 'denied' ? '🚫' : '⚠️'}
            </span>
            <p className="text-white text-xl font-bold text-center">
              {status === 'denied'
                ? '카메라 권한이 필요해요!'
                : '포즈 인식 준비에 실패했어요'}
            </p>
            <p className="text-white/70 text-sm text-center">
              {status === 'denied'
                ? '브라우저 주소창 옆 🔒 아이콘을 클릭해서 카메라를 허용해 주세요.'
                : '페이지를 새로고침 해보세요.'}
            </p>
          </div>
        )}

        {/* Game overlay content (e.g. accuracy bars, round info) */}
        {children}
      </div>
    );
  },
);

export default WebcamView;
