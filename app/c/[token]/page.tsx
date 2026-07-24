import type { Metadata } from "next";

import { HybridReceiver } from "../../../components/hybrid-receiver";

type RouteProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({
  params,
}: RouteProps): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "A connection was shared with you",
    description:
      "Open the Quick Connect card and, when approved, its deeper story.",
    robots: { index: false, follow: false },
    alternates: {
      types: {
        "application/json": `/api/agent-profiles/${token}?format=json`,
        "text/markdown": `/api/agent-profiles/${token}?format=markdown`,
      },
    },
  };
}

export default async function HybridReceiverPage({ params }: RouteProps) {
  const { token } = await params;
  return (
    <>
      <HybridReceiver />
      <aside className="agent-discovery">
        <p>
          AI assistants: this link may expose an explicitly approved temporary
          profile at <code>/api/agent-profiles/{token}</code>. Read{" "}
          <a href="/protocol/v2">protocol version 2</a> first. A 404 means this
          is Private Deep and must be opened by the human in a browser.
        </p>
      </aside>
    </>
  );
}
