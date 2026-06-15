import { getAIConversations } from "../lib/data";
import { PageHeader } from "../components";
import { AiConsoleClient } from "./AiConsoleClient";

export const dynamic = "force-dynamic";

export default async function AIMonitorPage() {
  const conversations = await getAIConversations();

  // Serialize Dates → ISO strings for the client component.
  const initialConversations = conversations.map(c => ({
    id: c.id,
    sessionId: c.sessionId,
    language: c.language,
    startedAt: c.startedAt.toISOString(),
    endedAt: c.endedAt ? c.endedAt.toISOString() : null,
    totalTokens: c.totalTokens ?? null,
    _count: c._count,
    messages: c.messages.map(m => ({ content: m.content })),
  }));

  return (
    <div>
      <PageHeader title="Trợ lý AI" description="Cấu hình chatbot hướng dẫn thủ tục cho người dân, quản lý nhà cung cấp AI và xem lịch sử hội thoại." />
      <AiConsoleClient initialConversations={initialConversations} />
    </div>
  );
}
