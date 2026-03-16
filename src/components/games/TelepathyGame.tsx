'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Webcam from 'react-webcam';
import { initMultiPoseLandmarker } from '@/lib/mediapipe';
import { normalizePose, computeSimilarity, drawPersonSkeleton } from '@/lib/mirrorUtils';
import type { Landmark } from '@/types';

const TOTAL_ROUNDS = 5;
const PREP_DURATION = 5;   // seconds to show word before freeze
const FREEZE_FROM = 3;
const SNAP_DURATION_MS = 2500;
const SYNC_THRESHOLD = 80;
const P1_COLOR = '#60a5fa';
const P2_COLOR = '#fbbf24';

const WORDS = [
  // 자연/동물
  { word: '비행기', emoji: '✈️' },
  { word: '나무', emoji: '🌲' },
  { word: '별', emoji: '⭐' },
  { word: '꽃', emoji: '🌸' },
  { word: '번개', emoji: '⚡' },
  { word: '파도', emoji: '🌊' },
  { word: '산', emoji: '⛰️' },
  { word: '새', emoji: '🐦' },
  { word: '공룡', emoji: '🦕' },
  { word: '상어', emoji: '🦈' },
  { word: '나비', emoji: '🦋' },
  { word: '뱀', emoji: '🐍' },
  { word: '문어', emoji: '🐙' },
  { word: '게', emoji: '🦀' },
  { word: '독수리', emoji: '🦅' },
  { word: '캥거루', emoji: '🦘' },
  { word: '펭귄', emoji: '🐧' },
  { word: '고릴라', emoji: '🦍' },
  { word: '악어', emoji: '🐊' },
  // 사람/동작
  { word: '로봇', emoji: '🤖' },
  { word: '슈퍼히어로', emoji: '🦸' },
  { word: '하트', emoji: '❤️' },
  { word: '좀비', emoji: '🧟' },
  { word: '발레리나', emoji: '🩰' },
  { word: '스키', emoji: '⛷️' },
  { word: '서핑', emoji: '🏄' },
  { word: '역도', emoji: '🏋️' },
  { word: '태권도', emoji: '🥋' },
  { word: '체조', emoji: '🤸' },
  // 사물/기타
  { word: '시계', emoji: '⏰' },
  { word: '망원경', emoji: '🔭' },
  { word: '기타', emoji: '🎸' },
  { word: '우산', emoji: '☂️' },
  { word: '십자가', emoji: '✝️' },
  { word: '사다리', emoji: '🪜' },
  // 동물 추가
  { word: '치타', emoji: '🐆' },
  { word: '기린', emoji: '🦒' },
  { word: '코끼리', emoji: '🐘' },
  { word: '플라밍고', emoji: '🦩' },
  { word: '곰', emoji: '🐻' },
  { word: '원숭이', emoji: '🐒' },
  { word: '두루미', emoji: '🕊️' },
  { word: '오리', emoji: '🦆' },
  { word: '말', emoji: '🐴' },
  { word: '사자', emoji: '🦁' },
];

function pickWords(n: number) {
  const shuffled = [...WORDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

type Phase = 'names' | 'word' | 'freeze' | 'snap' | 'game-over';

// ── Main component ────────────────────────────────────────────────────────────

export default function TelepathyGame() {
  const [phase, setPhase] = useState<Phase>('names');
  const [p1Name, setP1Name] = useState('');
  const [p2Name, setP2Name] = useState('');
  const [p1Input, setP1Input] = useState('');
  const [p2Input, setP2Input] = useState('');
  const [currentRound, setCurrentRound] = useState(0);
  const [roundWords, setRoundWords] = useState(() => pickWords(TOTAL_ROUNDS));
  const [prepTime, setPrepTime] = useState(PREP_DURATION);
  const [freezeCount, setFreezeCount] = useState(FREEZE_FROM);
  const [snapSimilarity, setSnapSimilarity] = useState(0);
  const [roundResults, setRoundResults] = useState<boolean[]>([]);
  const [poseCount, setPoseCount] = useState(0);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<Awaited<ReturnType<typeof initMultiPoseLandmarker>> | null>(null);
  const rafRef = useRef<number>(0);
  const lastVideoTimeRef = useRef(-1);
  const latestPosesRef = useRef<Landmark[][] | null>(null);
  const phaseRef = useRef<Phase>('names');

  phaseRef.current = phase;

  const currentWord = roundWords[currentRound] ?? roundWords[0];

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

  // ── Prep timer (word phase) ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'word') return;
    if (prepTime <= 0) {
      setFreezeCount(FREEZE_FROM);
      setPhase('freeze');
      return;
    }
    const t = setTimeout(() => setPrepTime((p) => p - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, prepTime]);

  // ── Freeze countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'freeze') return;
    if (freezeCount <= 0) {
      // Take snapshot
      const poses = latestPosesRef.current;
      let sim = 0;
      if (poses && poses.length >= 2) {
        const sorted = [...poses].sort((a, b) => {
          const ax = 1 - (a[23].x + a[24].x) / 2;
          const bx = 1 - (b[23].x + b[24].x) / 2;
          return ax - bx;
        });
        const norm1 = normalizePose(sorted[0]);
        const norm2 = normalizePose(sorted[1], true);
        sim = computeSimilarity(norm1, norm2);
      }
      setSnapSimilarity(sim);
      const success = sim >= SYNC_THRESHOLD;
      setRoundResults((prev) => [...prev, success]);
      setPhase('snap');
      return;
    }
    const t = setTimeout(() => setFreezeCount((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, freezeCount]);

  // ── Auto-advance after snap result ───────────────────────────────────────
  useEffect(() => {
    if (phase !== 'snap') return;
    const t = setTimeout(() => {
      if (currentRound + 1 >= TOTAL_ROUNDS) {
        setPhase('game-over');
      } else {
        setCurrentRound((r) => r + 1);
        setPrepTime(PREP_DURATION);
        setPhase('word');
      }
    }, SNAP_DURATION_MS);
    return () => clearTimeout(t);
  }, [phase, currentRound]);

  // ── Detection loop ────────────────────────────────────────────────────────
  const detect = useCallback(() => {
    const video = webcamRef.current?.video;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !canvas || !landmarker || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detect);
      return;
    }

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
    latestPosesRef.current = detected.length >= 2 ? detected : null;
    setPoseCount(detected.length);

    if (detected.length >= 2) {
      const sorted = [...detected].sort((a, b) => {
        const ax = 1 - (a[23].x + a[24].x) / 2;
        const bx = 1 - (b[23].x + b[24].x) / 2;
        return ax - bx;
      });
      drawPersonSkeleton(ctx, sorted[0], canvas.width, canvas.height, P1_COLOR);
      drawPersonSkeleton(ctx, sorted[1], canvas.width, canvas.height, P2_COLOR);
    } else if (detected.length === 1) {
      drawPersonSkeleton(ctx, detected[0], canvas.width, canvas.height, P1_COLOR);
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
    setRoundWords(pickWords(TOTAL_ROUNDS));
    setCurrentRound(0);
    setRoundResults([]);
    setPrepTime(PREP_DURATION);
    setPhase('word');
  };

  const handleRestart = () => {
    setRoundWords(pickWords(TOTAL_ROUNDS));
    setCurrentRound(0);
    setRoundResults([]);
    setPrepTime(PREP_DURATION);
    setPhase('word');
  };

  // ── Game-over screen ──────────────────────────────────────────────────────
  if (phase === 'game-over') {
    const successCount = roundResults.filter(Boolean).length;
    const getGrade = () => {
      if (successCount === 5) return { grade: 'S', emoji: '🔮', msg: '완벽한 텔레파시!' };
      if (successCount >= 4) return { grade: 'A', emoji: '⭐', msg: '환상의 짝꿍!' };
      if (successCount >= 3) return { grade: 'B', emoji: '😊', msg: '텔레파시가 통했어요!' };
      if (successCount >= 2) return { grade: 'C', emoji: '💪', msg: '조금 더 연습해봐요!' };
      return { grade: 'D', emoji: '🤔', msg: '다시 도전해보세요!' };
    };
    const { grade, emoji, msg } = getGrade();

    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
        <div className="bg-slate-800 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl">
          <div className="text-7xl mb-3">{emoji}</div>
          <div className="text-7xl font-black text-white mb-1">{grade}</div>
          <p className="text-slate-300 text-lg mb-6">{msg}</p>

          <div className="bg-slate-700 rounded-2xl p-4 mb-4">
            <p className="text-slate-400 text-sm mb-1">텔레파시 성공</p>
            <p className="text-white text-4xl font-black">{successCount} / {TOTAL_ROUNDS}</p>
          </div>

          {/* Round breakdown */}
          <div className="flex justify-center gap-2 mb-6">
            {roundResults.map((success, i) => (
              <div key={i} className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${success ? 'bg-green-600' : 'bg-red-800'}`}>
                {success ? '✓' : '✗'}
              </div>
            ))}
          </div>

          <p className="text-slate-500 text-sm mb-6">{p1Name} & {p2Name}</p>

          <div className="flex gap-3">
            <button
              onClick={handleRestart}
              className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold py-4 rounded-2xl transition-colors text-lg"
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

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
        <Link href="/" className="text-slate-400 hover:text-white transition-colors text-sm">
          ← 허브
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔮</span>
          <h1 className="text-white font-bold text-lg">텔레파시 게임</h1>
        </div>
        <span className="w-16" />
      </header>

      {/* Names screen */}
      {phase === 'names' && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-slate-800 rounded-3xl p-10 max-w-sm w-full text-center shadow-2xl">
            <div className="text-6xl mb-4">🔮</div>
            <h2 className="text-white text-3xl font-black mb-2">텔레파시 게임</h2>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              단어를 보고 몸으로 표현해보세요!<br />
              둘이 <span className="text-purple-400 font-bold">80% 이상</span> 비슷하면 텔레파시 성공!<br />
              총 {TOTAL_ROUNDS}라운드 도전!
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
                className="w-full bg-purple-900/30 border border-purple-500/40 text-white text-lg text-center rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={!p1Input.trim() || !p2Input.trim()}
                className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xl py-4 rounded-2xl transition-colors"
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
          {/* Round progress bar */}
          <div className="flex items-center gap-3 px-4 py-3 bg-slate-800 border-b border-slate-700">
            <span className="text-slate-400 text-sm shrink-0">라운드</span>
            <div className="flex gap-1.5 flex-1">
              {Array.from({ length: TOTAL_ROUNDS }, (_, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full transition-colors ${
                    i < roundResults.length
                      ? roundResults[i] ? 'bg-green-500' : 'bg-red-600'
                      : i === currentRound
                        ? 'bg-purple-400 animate-pulse'
                        : 'bg-slate-600'
                  }`}
                />
              ))}
            </div>
            <span className="text-slate-400 text-sm shrink-0">{currentRound + 1}/{TOTAL_ROUNDS}</span>
          </div>

          {/* Webcam area */}
          <div className="flex-1 relative bg-black overflow-hidden">
            {/* Model loading */}
            {modelStatus === 'loading' && (
              <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 border-4 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-white text-xl font-bold">웹캠을 준비 중이에요 📷</p>
              </div>
            )}

            {/* Word phase overlay */}
            {phase === 'word' && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 gap-4">
                <p className="text-slate-300 text-lg font-semibold">이걸 몸으로 표현해보세요!</p>
                <div className="text-center bg-slate-900/80 rounded-3xl px-10 py-6">
                  <div className="text-8xl mb-2">{currentWord.emoji}</div>
                  <div className="text-white text-4xl font-black">{currentWord.word}</div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white font-black text-lg">
                    {prepTime}
                  </div>
                  <span className="text-slate-300 text-sm">초 후 FREEZE!</span>
                </div>
              </div>
            )}

            {/* Freeze countdown overlay */}
            {phase === 'freeze' && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 gap-4">
                <p className="text-white text-2xl font-bold">포즈를 유지하세요!</p>
                <div
                  key={freezeCount}
                  className="text-white font-black animate-ping"
                  style={{ fontSize: 160, lineHeight: 1 }}
                >
                  {freezeCount}
                </div>
              </div>
            )}

            {/* Snap result overlay */}
            {phase === 'snap' && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/80 gap-5">
                {snapSimilarity >= SYNC_THRESHOLD ? (
                  <>
                    <div className="text-7xl">🔮</div>
                    <p className="text-green-400 text-5xl font-black">텔레파시!</p>
                    <p className="text-white text-2xl font-bold">{currentWord.emoji} {currentWord.word}</p>
                    <p className="text-green-300 text-xl">{snapSimilarity}% 일치!</p>
                  </>
                ) : (
                  <>
                    <div className="text-7xl">💨</div>
                    <p className="text-red-400 text-4xl font-black">아쉬워요!</p>
                    <p className="text-white text-2xl font-bold">{currentWord.emoji} {currentWord.word}</p>
                    <p className="text-slate-300 text-xl">{snapSimilarity}% 일치 (목표 {SYNC_THRESHOLD}%)</p>
                  </>
                )}
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

            {/* Player labels (visible during word/freeze) */}
            {(phase === 'word' || phase === 'freeze') && (
              <>
                <div className="absolute bottom-4 left-4 z-40 bg-blue-600/80 backdrop-blur-sm text-white text-sm font-bold px-3 py-1 rounded-full pointer-events-none">
                  {p1Name}
                </div>
                <div className="absolute bottom-4 right-4 z-40 bg-purple-600/80 backdrop-blur-sm text-white text-sm font-bold px-3 py-1 rounded-full pointer-events-none">
                  {p2Name}
                </div>
              </>
            )}

            {/* Not enough people warning */}
            {phase === 'word' && poseCount < 2 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-slate-900/80 backdrop-blur-sm text-yellow-400 text-sm font-bold px-4 py-2 rounded-full">
                두 명이 웹캠 앞에 서주세요!
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
