import { notFound } from 'next/navigation';
import WipeGame from '@/components/games/WipeGame';
import MirrorGame from '@/components/games/MirrorGame';
import TelepathyGame from '@/components/games/TelepathyGame';

interface PageProps {
  params: Promise<{ type: string }>;
}

const ACTIVE_GAME_TYPES = ['wipe', 'mirror', 'telepathy'] as const;
type ActiveGameType = (typeof ACTIVE_GAME_TYPES)[number];

function isActiveGameType(type: string): type is ActiveGameType {
  return ACTIVE_GAME_TYPES.includes(type as ActiveGameType);
}

export default async function GamePage({ params }: PageProps) {
  const { type } = await params;

  if (!isActiveGameType(type)) notFound();

  if (type === 'mirror') return <MirrorGame />;
  if (type === 'telepathy') return <TelepathyGame />;
  return <WipeGame />;
}

export function generateStaticParams() {
  return ACTIVE_GAME_TYPES.map((type) => ({ type }));
}
