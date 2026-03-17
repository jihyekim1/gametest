'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Webcam from 'react-webcam';
import { initHandLandmarker } from '@/lib/mediapipe';
import { paintHeart, paintStar, getCoverage } from '@/lib/wipeUtils';

const WIN_THRESHOLD = 0.90;
const COUNTDOWN_FROM = 3;
const TOTAL_ROUNDS = 5;
const ROUND_RESULT_DURATION_MS = 2000;
// Brush radius as fraction of half-canvas width. Shrinks each round.
const BRUSH_RATIOS = [0.080, 0.065, 0.050, 0.038, 0.027];
const P1_COLOR = '#60a5fa'; // blue
const P2_COLOR = '#fbbf24'; // amber
// Hand landmark indices: palm (wrist + MCPs) + all finger tips
const PAINT_LANDMARKS = [0, 1, 5, 9, 13, 17, 4, 8, 12, 16, 20];

type Phase = 'names' | 'countdown' | 'playing' | 'round-result' | 'game-over';

// ── Sub-components ────────────────────────────────────────────────────────────

function CoverageBar({
  label,
  color,
  value,
}: {
  label: string;
  color: string;
  value: number;
}) {
  return (
    <div className="flex flex-col gap-1 flex-1 min-w-0">
      <div className="flex justify-between text-sm font-bold">
        <span className="text-white truncate">{label}</span>
        <span style={{ color }}>{Math.round(value * 100)}%</span>
      </div>
      <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-150"
          style={{ width: `${value * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function WipeGame() {
  const [phase, setPhase] = useState<Phase>('names');
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [p1Input, setP1Input] = useState('');
  const [p2Input, setP2Input] = useState('');
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [currentRound, setCurrentRound] = useState(1);
  const [p1Wins, setP1Wins] = useState(0);
  const [p2Wins, setP2Wins] = useState(0);
  const [leftCoverage, setLeftCoverage] = useState(0);
  const [rightCoverage, setRightCoverage] = useState(0);
  const [roundWinner, setRoundWinner] = useState<1 | 2 | null>(null);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [webcamDenied, setWebcamDenied] = useState(false);

  const webcamRef = useRef<Webcam>(null);
  const leftCanvasRef = useRef<HTMLCanvasElement>(null);
  const rightCanvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<Awaited<ReturnType<typeof initHandLandmarker>> | null>(null);
  const rafRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);
  const lastCoverageCheckRef = useRef(0);
  const phaseRef = useRef<Phase>('names');
  const currentRoundRef = useRef(1);
  const winnerDetectedRef = useRef(false);

  phaseRef.current = phase;
  currentRoundRef.current = currentRound;

  // ── Init HandLandmarker ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        landmarkerRef.current = await initHandLandmarker();
        if (!cancelled) setModelStatus('ready');
      } catch {
        if (!cancelled) setModelStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Sync canvas sizes + clear when playing starts ─────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;
    const t = setTimeout(() => {
      [leftCanvasRef, rightCanvasRef].forEach((ref) => {
        const canvas = ref.current;
        if (!canvas) return;
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
      });
      winnerDetectedRef.current = false;
    }, 50);
    return () => clearTimeout(t);
  }, [phase, currentRound]); // currentRound dependency clears canvas each round

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      setPhase('playing');
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ── Auto-advance after round result ───────────────────────────────────────
  useEffect(() => {
    if (phase !== 'round-result') return;
    const t = setTimeout(() => {
      if (currentRound >= TOTAL_ROUNDS) {
        setPhase('game-over');
      } else {
        setCurrentRound((r) => r + 1);
        setLeftCoverage(0);
        setRightCoverage(0);
        setCountdown(COUNTDOWN_FROM);
        setPhase('countdown');
      }
    }, ROUND_RESULT_DURATION_MS);
    return () => clearTimeout(t);
  }, [phase, currentRound]);

  // ── Detection + paint loop ────────────────────────────────────────────────
  const detect = useCallback(() => {
    const video = webcamRef.current?.video;
    const landmarker = landmarkerRef.current;
    const leftCanvas = leftCanvasRef.current;
    const rightCanvas = rightCanvasRef.current;

    if (!video || !landmarker || video.readyState < 2 || !leftCanvas || !rightCanvas) {
      rafRef.current = requestAnimationFrame(detect);
      return;
    }

    if (video.currentTime === lastVideoTimeRef.current) {
      rafRef.current = requestAnimationFrame(detect);
      return;
    }
    lastVideoTimeRef.current = video.currentTime;

    const results = landmarker.detectForVideo(video, performance.now());

    if (phaseRef.current === 'playing' && results.landmarks.length > 0) {
      const leftCtx = leftCanvas.getContext('2d');
      const rightCtx = rightCanvas.getContext('2d');
      if (!leftCtx || !rightCtx) {
        rafRef.current = requestAnimationFrame(detect);
        return;
      }

      const round = currentRoundRef.current;
      const brushRadius = leftCanvas.width * BRUSH_RATIOS[round - 1];

      results.landmarks.forEach((handLandmarks) => {
        PAINT_LANDMARKS.forEach((idx) => {
          const lm = handLandmarks[idx];
          if (!lm) return;

          const mirroredX = 1 - lm.x;
          const y = lm.y;

          if (mirroredX < 0.5) {
            paintHeart(leftCtx, mirroredX * 2 * leftCanvas.width, y * leftCanvas.height, brushRadius, P1_COLOR);
          } else {
            paintStar(rightCtx, (mirroredX - 0.5) * 2 * rightCanvas.width, y * rightCanvas.height, brushRadius, P2_COLOR);
          }
        });
      });

      // Coverage check (throttled to every 200ms)
      const now = performance.now();
      if (now - lastCoverageCheckRef.current > 200 && !winnerDetectedRef.current) {
        lastCoverageCheckRef.current = now;
        const leftCov = getCoverage(leftCanvas);
        const rightCov = getCoverage(rightCanvas);
        setLeftCoverage(leftCov);
        setRightCoverage(rightCov);

        if (leftCov >= WIN_THRESHOLD) {
          winnerDetectedRef.current = true;
          setRoundWinner(1);
          setP1Wins((w) => w + 1);
          setPhase('round-result');
        } else if (rightCov >= WIN_THRESHOLD) {
          winnerDetectedRef.current = true;
          setRoundWinner(2);
          setP2Wins((w) => w + 1);
          setPhase('round-result');
        }
      }
    }

    rafRef.current = requestAnimationFrame(detect);
  }, []);

  useEffect(() => {
    if (modelStatus !== 'ready') return;
    rafRef.current = requestAnimationFrame(detect);
    return () => cancelAnimationFrame(rafRef.current);
  }, [modelStatus, detect]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const name1 = p1Input.trim();
    const name2 = p2Input.trim();
    if (!name1 || !name2) return;
    setP1Name(name1);
    setP2Name(name2);
    setCountdown(COUNTDOWN_FROM);
    setPhase('countdown');
  };

  const handleRestart = () => {
    [leftCanvasRef, rightCanvasRef].forEach((ref) => {
      const canvas = ref.current;
      if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    });
    setCurrentRound(1);
    setP1Wins(0);
    setP2Wins(0);
    setLeftCoverage(0);
    setRightCoverage(0);
    setRoundWinner(null);
    winnerDetectedRef.current = false;
    setCountdown(COUNTDOWN_FROM);
    setPhase('countdown');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // Game over screen
  if (phase === 'game-over') {
    const finalWinner = p1Wins > p2Wins ? p1Name : p2Wins > p1Wins ? p2Name : null;
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="bg-slate-800 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="text-7xl mb-4">{finalWinner ? '🏆' : '🤝'}</div>
          <h2 className="text-white text-4xl font-black mb-1">
            {finalWinner ? `${finalWinner} 승리!` : '무승부!'}
          </h2>
          <p className="text-slate-400 mb-6">총 {TOTAL_ROUNDS}라운드 결과</p>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-blue-900/40 border border-blue-500/30 rounded-2xl p-4">
              <p className="text-blue-300 text-sm truncate">{p1Name}</p>
              <p className="text-white text-4xl font-black">{p1Wins}</p>
              <p className="text-slate-500 text-xs">라운드 승</p>
            </div>
            <div className="bg-amber-900/40 border border-amber-500/30 rounded-2xl p-4">
              <p className="text-amber-300 text-sm truncate">{p2Name}</p>
              <p className="text-white text-4xl font-black">{p2Wins}</p>
              <p className="text-slate-500 text-xs">라운드 승</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRestart}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-colors text-lg"
            >
              다시 하기 🔄
            </button>
            <Link
              href="/"
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 rounded-2xl transition-colors text-lg text-center"
            >
              허브로 🏠
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 shrink-0">
        <Link href="/" className="text-slate-400 hover:text-white transition-colors text-sm">
          ← 허브
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🪟</span>
          <h1 className="text-white font-bold text-lg">화면 닦기</h1>
        </div>
        <span className="w-16" />
      </header>

      {/* Names screen */}
      {phase === 'names' && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-slate-800 rounded-3xl p-10 max-w-sm w-full text-center shadow-2xl">
            <div className="text-6xl mb-4">🪟</div>
            <h2 className="text-white text-3xl font-black mb-2">화면 닦기</h2>
            <p className="text-slate-300 text-sm mb-1 leading-relaxed">
              손으로 화면을 가득 색칠해보세요!
            </p>
            <p className="text-slate-400 text-xs mb-6">
              먼저 <span className="text-white font-bold">90%</span>를 채우면 라운드 승리 · 총 {TOTAL_ROUNDS}라운드
            </p>
            {modelStatus === 'error' && (
              <div className="bg-red-900/50 border border-red-500/50 rounded-xl p-3 mb-4 text-red-300 text-sm">
                손 인식 모델을 불러오지 못했어요. 새로고침 해보세요.
              </div>
            )}
            <form onSubmit={handleStart} className="space-y-3">
              <input
                type="text"
                value={p1Input}
                onChange={(e) => setP1Input(e.target.value)}
                placeholder="왼쪽 플레이어 이름"
                maxLength={10}
                autoFocus
                className="w-full bg-blue-900/30 border border-blue-500/40 text-white text-lg text-center rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-500"
              />
              <input
                type="text"
                value={p2Input}
                onChange={(e) => setP2Input(e.target.value)}
                placeholder="오른쪽 플레이어 이름"
                maxLength={10}
                className="w-full bg-amber-900/30 border border-amber-500/40 text-white text-lg text-center rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={!p1Input.trim() || !p2Input.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xl py-4 rounded-2xl transition-colors"
              >
                게임 시작! 🎮
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Game screen */}
      {phase !== 'names' && (
        <div className="flex-1 flex flex-col">
          {/* Score + round bar */}
          <div className="flex items-center gap-4 px-4 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
            <CoverageBar label={`${p1Name} 💙`} color={P1_COLOR} value={leftCoverage} />
            <div className="text-center shrink-0">
              <div className="text-slate-400 font-black text-base">VS</div>
              <div className="text-slate-500 text-xs">{currentRound}/{TOTAL_ROUNDS}</div>
            </div>
            <CoverageBar label={`${p2Name} ⭐`} color={P2_COLOR} value={rightCoverage} />
          </div>

          {/* Win count dots */}
          <div className="flex justify-between px-4 py-1.5 bg-slate-800/50 border-b border-slate-700/50 shrink-0">
            <div className="flex gap-1">
              {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
                <div key={i} className={`w-3 h-3 rounded-full ${i < p1Wins ? 'bg-blue-500' : 'bg-slate-700'}`} />
              ))}
            </div>
            <div className="flex gap-1">
              {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
                <div key={i} className={`w-3 h-3 rounded-full ${i < p2Wins ? 'bg-amber-500' : 'bg-slate-700'}`} />
              ))}
            </div>
          </div>

          {/* Webcam + paint canvas area */}
          <div className="flex-1 relative bg-black overflow-hidden">
            {/* Model loading overlay */}
            {modelStatus === 'loading' && (
              <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-white text-xl font-bold">웹캠을 준비 중이에요 📷</p>
              </div>
            )}

            {/* Webcam denied overlay */}
            {webcamDenied && (
              <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center gap-4 p-6">
                <span className="text-6xl">🚫</span>
                <p className="text-white text-xl font-bold text-center">카메라 권한이 필요해요!</p>
                <p className="text-white/70 text-sm text-center">
                  브라우저 주소창 옆 🔒 아이콘을 클릭해서 카메라를 허용해 주세요.
                </p>
              </div>
            )}

            {/* Countdown overlay */}
            {phase === 'countdown' && (
              <div className="absolute inset-0 z-40 bg-black/70 flex flex-col items-center justify-center">
                <p className="text-white text-2xl font-bold mb-4">
                  {currentRound}라운드 준비!
                </p>
                <div
                  key={countdown}
                  className="text-white font-black animate-ping"
                  style={{ fontSize: 160, lineHeight: 1 }}
                >
                  {countdown}
                </div>
              </div>
            )}

            {/* Round result overlay */}
            {phase === 'round-result' && roundWinner !== null && (
              <div className="absolute inset-0 z-40 bg-black/80 flex flex-col items-center justify-center gap-4">
                <div className="text-6xl">🎉</div>
                <p className="text-white text-4xl font-black">
                  {roundWinner === 1 ? p1Name : p2Name}
                </p>
                <p className="text-slate-300 text-lg">{currentRound}라운드 승리!</p>
                {currentRound < TOTAL_ROUNDS && (
                  <p className="text-slate-500 text-sm">다음 라운드 브러시가 더 작아져요 🖌️</p>
                )}
              </div>
            )}

            {/* Webcam video */}
            <Webcam
              ref={webcamRef}
              mirrored
              audio={false}
              onUserMediaError={() => setWebcamDenied(true)}
              videoConstraints={{ facingMode: 'user', width: 1280, height: 720 }}
              className="w-full h-full object-cover"
            />

            {/* Center divider */}
            <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/40 z-10 pointer-events-none" />

            {/* Player 1 paint canvas (left half) */}
            <canvas
              ref={leftCanvasRef}
              className="absolute top-0 left-0 w-1/2 h-full pointer-events-none"
            />

            {/* Player 2 paint canvas (right half) */}
            <canvas
              ref={rightCanvasRef}
              className="absolute top-0 right-0 w-1/2 h-full pointer-events-none"
            />

            {/* In-game player labels */}
            {phase === 'playing' && (
              <>
                <div className="absolute top-3 left-3 z-20 bg-blue-600/80 backdrop-blur-sm text-white text-sm font-bold px-3 py-1 rounded-full pointer-events-none">
                  {p1Name}
                </div>
                <div className="absolute top-3 right-3 z-20 bg-amber-600/80 backdrop-blur-sm text-white text-sm font-bold px-3 py-1 rounded-full pointer-events-none">
                  {p2Name}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
