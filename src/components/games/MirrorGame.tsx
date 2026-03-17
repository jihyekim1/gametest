'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Webcam from 'react-webcam';
import { initMultiPoseLandmarker } from '@/lib/mediapipe';
import { normalizePose, computeSimilarity, drawPersonSkeleton } from '@/lib/mirrorUtils';
import type { Landmark } from '@/types';

const GAME_DURATION = 30;
const SYNC_THRESHOLD = 80;
const COUNTDOWN_FROM = 3;
const P1_COLOR = '#60a5fa'; // blue
const P2_COLOR = '#fbbf24'; // amber

type Phase = 'names' | 'countdown' | 'playing' | 'result';

function getGrade(pct: number): { grade: string; emoji: string; msg: string } {
  if (pct >= 85) return { grade: 'S', emoji: '🏆', msg: '완벽한 텔레파시!' };
  if (pct >= 65) return { grade: 'A', emoji: '⭐', msg: '환상의 짝꿍!' };
  if (pct >= 45) return { grade: 'B', emoji: '😊', msg: '잘 맞췄어요!' };
  return { grade: 'C', emoji: '💪', msg: '연습하면 더 잘할 수 있어요!' };
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MirrorGame() {
  const [phase, setPhase] = useState<Phase>('names');
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [p1Input, setP1Input] = useState('');
  const [p2Input, setP2Input] = useState('');
  const [countdown, setCountdown] = useState(COUNTDOWN_FROM);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [similarity, setSimilarity] = useState(0);
  const [syncPct, setSyncPct] = useState(0); // % of total frames that were synced
  const [syncing, setSyncing] = useState(false);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [poseCount, setPoseCount] = useState(0); // how many people detected

  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<Awaited<ReturnType<typeof initMultiPoseLandmarker>> | null>(null);
  const rafRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);
  const phaseRef = useRef<Phase>('names');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync frame tracking
  const totalFramesRef = useRef(0);
  const syncFramesRef = useRef(0);

  phaseRef.current = phase;

  // ── Init model ────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        landmarkerRef.current = await initMultiPoseLandmarker();
        if (!cancelled) setModelStatus('ready');
      } catch {
        if (!cancelled) setModelStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (countdown <= 0) {
      totalFramesRef.current = 0;
      syncFramesRef.current = 0;
      setTimeLeft(GAME_DURATION);
      setPhase('playing');
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  // ── Game timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing') return;

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          const pct = totalFramesRef.current > 0
            ? Math.round((syncFramesRef.current / totalFramesRef.current) * 100)
            : 0;
          setSyncPct(pct);
          setPhase('result');
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // ── Pose detection loop ───────────────────────────────────────────────────
  const detect = useCallback(() => {
    const video = webcamRef.current?.video;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !canvas || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detect);
      return;
    }

    // Sync canvas size to video
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    if (video.currentTime === lastVideoTimeRef.current) {
      rafRef.current = requestAnimationFrame(detect);
      return;
    }
    lastVideoTimeRef.current = video.currentTime;

    const results = landmarker.detectForVideo(video, performance.now());
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const detected = results.landmarks as Landmark[][];
    setPoseCount(detected.length);

    if (detected.length >= 2) {
      // Sort by mirrored x of hip midpoint — leftmost body = P1
      const sorted = [...detected].sort((a, b) => {
        const ax = 1 - (a[23].x + a[24].x) / 2;
        const bx = 1 - (b[23].x + b[24].x) / 2;
        return ax - bx;
      });

      const [pose1, pose2] = sorted;

      // Draw skeletons
      drawPersonSkeleton(ctx, pose1, canvas.width, canvas.height, P1_COLOR);
      drawPersonSkeleton(ctx, pose2, canvas.width, canvas.height, P2_COLOR);

      // Compute similarity (flip P2 x for true mirror comparison)
      const norm1 = normalizePose(pose1);
      const norm2 = normalizePose(pose2, true);
      const sim = computeSimilarity(norm1, norm2);
      setSimilarity(sim);

      if (phaseRef.current === 'playing') {
        totalFramesRef.current++;
        const isSyncing = sim >= SYNC_THRESHOLD;
        if (isSyncing) syncFramesRef.current++;
        setSyncing(isSyncing);
      }
    } else if (detected.length === 1) {
      drawPersonSkeleton(ctx, detected[0], canvas.width, canvas.height, P1_COLOR);
      setSimilarity(0);
      setSyncing(false);
    } else {
      setSimilarity(0);
      setSyncing(false);
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
    const n1 = p1Input.trim(), n2 = p2Input.trim();
    if (!n1 || !n2) return;
    setP1Name(n1);
    setP2Name(n2);
    setCountdown(COUNTDOWN_FROM);
    setPhase('countdown');
  };

  const handleRestart = () => {
    setSimilarity(0);
    setSyncing(false);
    setSyncPct(0);
    setCountdown(COUNTDOWN_FROM);
    setPhase('countdown');
  };

  // ── Result screen ─────────────────────────────────────────────────────────
  if (phase === 'result') {
    const { grade, emoji, msg } = getGrade(syncPct);
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="bg-slate-800 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
          <div className="text-7xl mb-3">{emoji}</div>
          <div className="text-7xl font-black text-white mb-1">{grade}</div>
          <p className="text-slate-300 text-lg mb-6">{msg}</p>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-700 rounded-2xl p-4">
              <p className="text-slate-400 text-sm">싱크 달성률</p>
              <p className="text-white text-3xl font-black">{syncPct}%</p>
            </div>
            <div className="bg-slate-700 rounded-2xl p-4">
              <p className="text-slate-400 text-sm">싱크 시간</p>
              <p className="text-white text-3xl font-black">
                {Math.round(syncPct * GAME_DURATION / 100)}초
              </p>
            </div>
          </div>

          <p className="text-slate-500 text-sm mb-6">
            {p1Name} & {p2Name}
          </p>

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

  // Similarity color
  const simColor = similarity >= SYNC_THRESHOLD ? '#4ade80' : similarity >= 50 ? '#fbbf24' : '#f87171';

  return (
    <div className="h-screen overflow-hidden bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700 shrink-0">
        <Link href="/" className="text-slate-400 hover:text-white transition-colors text-sm">
          ← 허브
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🪞</span>
          <h1 className="text-white font-bold text-lg">미러 챌린지</h1>
        </div>
        <span className="w-16" />
      </header>

      {/* Names screen */}
      {phase === 'names' && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-slate-800 rounded-3xl p-10 max-w-sm w-full text-center shadow-2xl">
            <div className="text-6xl mb-4">🪞</div>
            <h2 className="text-white text-3xl font-black mb-2">미러 챌린지</h2>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              서로의 포즈를 따라해보세요!<br />
              <span className="text-green-400 font-bold">80% 이상</span> 일치하면 SYNC!<br />
              30초 동안 얼마나 오래 맞출 수 있을까요?
            </p>
            {modelStatus === 'error' && (
              <div className="bg-red-900/50 border border-red-500/50 rounded-xl p-3 mb-4 text-red-300 text-sm">
                포즈 인식 모델을 불러오지 못했어요. 새로고침 해보세요.
              </div>
            )}
            <form onSubmit={handleStart} className="space-y-3">
              <input
                type="text"
                value={p1Input}
                onChange={(e) => setP1Input(e.target.value)}
                placeholder="플레이어 1 이름"
                maxLength={10}
                autoFocus
                className="w-full bg-blue-900/30 border border-blue-500/40 text-white text-lg text-center rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-500"
              />
              <input
                type="text"
                value={p2Input}
                onChange={(e) => setP2Input(e.target.value)}
                placeholder="플레이어 2 이름"
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
          {/* Top HUD */}
          <div className="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700 shrink-0">
            <span className="text-blue-400 font-bold text-sm">{p1Name}</span>
            <div className="flex items-center gap-3">
              <span className="text-slate-400 text-sm">⏱</span>
              <span className={`text-2xl font-black ${timeLeft <= 5 ? 'text-red-400' : 'text-white'}`}>
                {timeLeft}
              </span>
            </div>
            <span className="text-amber-400 font-bold text-sm">{p2Name}</span>
          </div>

          {/* Webcam area */}
          <div className="flex-1 relative bg-black overflow-hidden">
            {/* Model loading */}
            {modelStatus === 'loading' && (
              <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-white text-xl font-bold">웹캠을 준비 중이에요 📷</p>
              </div>
            )}

            {/* Countdown overlay */}
            {phase === 'countdown' && (
              <div className="absolute inset-0 z-40 bg-black/70 flex flex-col items-center justify-center">
                <p className="text-white text-2xl font-bold mb-4">서로 마주보고 준비!</p>
                <div
                  key={countdown}
                  className="text-white font-black animate-ping"
                  style={{ fontSize: 160, lineHeight: 1 }}
                >
                  {countdown}
                </div>
              </div>
            )}

            {/* Webcam */}
            <Webcam
              ref={webcamRef}
              mirrored
              audio={false}
              videoConstraints={{ facingMode: 'user', width: 1280, height: 720 }}
              className="w-full h-full object-cover"
            />

            {/* Skeleton canvas */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Not enough people warning */}
            {phase === 'playing' && poseCount < 2 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/80 backdrop-blur-sm text-yellow-400 text-sm font-bold px-4 py-2 rounded-full">
                두 명이 웹캠 앞에 서주세요!
              </div>
            )}

            {/* Center similarity display */}
            {phase === 'playing' && poseCount >= 2 && (
              <div className="absolute inset-0 flex flex-col items-center justify-end pb-6 pointer-events-none">
                {/* SYNC flash */}
                {syncing && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                    <div
                      key={`sync-${Math.floor(Date.now() / 500)}`}
                      className="text-green-400 font-black text-6xl animate-ping"
                    >
                      SYNC!
                    </div>
                  </div>
                )}

                {/* Similarity meter */}
                <div className="bg-slate-900/80 backdrop-blur-sm rounded-3xl px-8 py-4 text-center">
                  <p className="text-slate-400 text-sm mb-1">싱크율</p>
                  <p
                    className="text-6xl font-black transition-colors duration-200"
                    style={{ color: simColor }}
                  >
                    {similarity}%
                  </p>
                  <div className="mt-2 w-48 h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-150"
                      style={{ width: `${similarity}%`, backgroundColor: simColor }}
                    />
                  </div>
                  <p className="text-slate-500 text-xs mt-1">
                    {similarity >= SYNC_THRESHOLD ? '🟢 SYNC 중!' : `🎯 목표: ${SYNC_THRESHOLD}%`}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
