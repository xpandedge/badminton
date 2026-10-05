import { ConnectTv } from "@/components/tv/ConnectTv";
export const metadata = { title: "Connect a TV", robots: { index: false, follow: false } };
export default async function ConnectPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ConnectTv boardCode={code} receiverId={process.env.NEXT_PUBLIC_GOOGLE_CAST_APP_ID ?? ""} />;
}
