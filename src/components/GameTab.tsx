'use client';

import Link from 'next/link';
import type { Game } from '@/types';

interface GameTabProps {
  game: Game;
}

const PHASE_COLORS: Record<number, string> = {
  1: 'bg-green-500/20 text-green-300 border-green-500/30',
  2: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  3: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
};

export default function GameTab({ game }: GameTabProps) {
  const isPlayable = game.isActive && !game.comingSoon;

  const card = (
    <div
      className={`
        relative rounded-2xl border p-6 transition-all duration-200 cursor-pointer
        ${
          isPlayable
            ? 'bg-slate-800 border-slate-600 hover:border-blue-400 hover:bg-slate-700 hover:scale-105 hover:shadow-xl hover:shadow-blue-500/10'
            : 'bg-slate-800/50 border-slate-700 opacity-60 cursor-not-allowed'
        }
      `}
    >
      {/* Coming soon badge */}
      {game.comingSoon && (
        <span className="absolute top-3 right-3 text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full border border-slate-600">
          준비 중
        </span>
      )}

      {/* Phase badge */}
      <span
        className={`inline-block text-xs px-2 py-0.5 rounded-full border mb-3 ${PHASE_COLORS[game.phase]}`}
      >
        Phase {game.phase}
      </span>

      {/* Emoji + name */}
      <div className="flex items-center gap-3 mb-3">
        <span className="text-4xl">{game.emoji}</span>
        <div>
          <h2 className="text-white text-xl font-bold">{game.name}</h2>
          <p className="text-slate-400 text-xs">
            {game.minPlayers === game.maxPlayers
              ? `${game.minPlayers}인`
              : `${game.minPlayers}~${game.maxPlayers}인`}
          </p>
        </div>
      </div>

      {/* Description */}
      <p className="text-slate-300 text-sm leading-relaxed">{game.description}</p>

      {/* Play button indicator */}
      {isPlayable && (
        <div className="mt-4 flex items-center gap-2 text-blue-400 text-sm font-semibold">
          <span>지금 시작하기</span>
          <span>→</span>
        </div>
      )}
    </div>
  );

  if (!isPlayable) return card;

  return <Link href={`/game/${game.type}`}>{card}</Link>;
}
