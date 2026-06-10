import { getAIConversations } from "../lib/data";
import { EmptyState, PageHeader, Table, Td, fmt } from "../components";

export const dynamic = "force-dynamic";

export default async function AIMonitorPage() {
  const conversations = await getAIConversations();

  return (
    <div>
      <PageHeader title="Trợ lý AI" description="Lịch sử hội thoại AI, câu hỏi công dân, hiệu suất phản hồi." />

      {conversations.length === 0 ? (
        <EmptyState title="Chưa có cuộc hội thoại" detail="Hội thoại xuất hiện sau khi công dân sử dụng Trợ lý ảo tại kiosk." />
      ) : (
        <Table headers={["Phiên", "Ngôn ngữ", "Bắt đầu", "Kết thúc", "Tin nhắn", "Tin nhắn cuối", "Tokens"]}>
          {conversations.map(c => (
            <tr key={c.id} className="border-t border-slate-100">
              <Td><span className="font-mono text-xs text-slate-500">{c.sessionId.slice(0, 8)}…</span></Td>
              <Td>{c.language.toUpperCase()}</Td>
              <Td>{fmt(c.startedAt)}</Td>
              <Td>{fmt(c.endedAt)}</Td>
              <Td>{c._count.messages}</Td>
              <Td>
                <span className="text-xs text-slate-600 max-w-xs truncate block">
                  {c.messages[0]?.content?.slice(0, 60) ?? "—"}
                </span>
              </Td>
              <Td>{c.totalTokens ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
