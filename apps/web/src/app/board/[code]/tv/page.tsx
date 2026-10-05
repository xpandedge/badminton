import { LiveTvBoard } from "@/components/tv/LiveTvBoard";
export const metadata = { title: "TV board", robots: { index: false, follow: false } };
export default async function TvPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <LiveTvBoard code={code} />;
}
