import GameTab from '@/components/GameTab';
import type { Game } from '@/types';

const GAMES: Game[] = [
  {
    id: 'wipe',
    name: '화면 닦기',
    type: 'wipe',
    emoji: '🪟',
    description: '손으로 화면을 가득 색칠해보세요! 먼저 90%를 채우는 사람이 승리! 2인 대결 게임이에요.',
    minPlayers: 2,
    maxPlayers: 2,
    isActive: true,
    phase: 2,
    comingSoon: false,
  },
  {
    id: 'telepathy',
    name: '텔레파시 게임',
    type: 'telepathy',
    emoji: '🔮',
    description: '단어를 보고 몸으로 표현해보세요! 둘이 80% 이상 비슷하면 텔레파시 성공! 5라운드 도전!',
    minPlayers: 2,
    maxPlayers: 2,
    isActive: true,
    phase: 2,
    comingSoon: false,
  },
  {
    id: 'mirror',
    name: '미러 챌린지',
    type: 'mirror',
    emoji: '🪞',
    description: '서로의 포즈를 따라해보세요! 80% 이상 일치하면 SYNC! 30초 동안 얼마나 오래 맞출 수 있을까요?',
    minPlayers: 2,
    maxPlayers: 2,
    isActive: true,
    phase: 3,
    comingSoon: false,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <span className="text-4xl">🎮</span>
          <div>
            <h1 className="text-white text-2xl font-black">웹캠 모션게임 허브</h1>
            <p className="text-slate-400 text-sm">몸으로 조작하는 웹캠 게임 — 설치 불필요!</p>
          </div>
        </div>
      </header>

      {/* Game grid */}
      <main className="max-w-4xl mx-auto p-6">
        <div className="mb-6">
          <h2 className="text-white text-lg font-bold mb-1">게임 선택</h2>
          <p className="text-slate-400 text-sm">
            원하는 게임 탭을 눌러 시작하세요. 웹캠이 필요해요! 📷
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {GAMES.map((game) => (
            <GameTab key={game.id} game={game} />
          ))}
        </div>

        {/* How to play */}
        <div className="mt-10 bg-slate-800 rounded-2xl p-6 border border-slate-700">
          <h2 className="text-white font-bold text-lg mb-4">🎯 어떻게 하나요?</h2>
          <ol className="space-y-3 text-slate-300 text-sm">
            <li className="flex gap-3">
              <span className="text-blue-400 font-black text-lg leading-none">1</span>
              <span>원하는 게임 카드를 클릭해요.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-blue-400 font-black text-lg leading-none">2</span>
              <span>브라우저가 카메라 권한을 요청하면 <strong className="text-white">허용</strong>을 눌러요.</span>
            </li>
            <li className="flex gap-3">
              <span className="text-blue-400 font-black text-lg leading-none">3</span>
              <span>별명을 입력하고 게임을 시작해요!</span>
            </li>
            <li className="flex gap-3">
              <span className="text-blue-400 font-black text-lg leading-none">4</span>
              <span>웹캠 앞에 서서 <strong className="text-white">전신이 잘 보이도록</strong> 약 1~2m 거리를 유지해요.</span>
            </li>
          </ol>
        </div>

        <p className="mt-6 text-center text-slate-600 text-xs">
          Next.js 15 + MediaPipe BlazePose
        </p>
      </main>
    </div>
  );
}
