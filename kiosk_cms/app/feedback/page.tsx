import { getFeedbacks } from "../lib/data";
import { getScope } from "../lib/session";
import { EmptyState, PageHeader, Metric, fmt } from "../components";

export const dynamic = "force-dynamic";

const STARS = ["", "★", "★★", "★★★", "★★★★", "★★★★★"];
const TARGET_LABELS: Record<string, string> = {
  SERVICE: "Dịch vụ",
  OFFICER: "Cán bộ",
  KIOSK: "Thiết bị kiosk",
  APPLICATION: "Hồ sơ",
  QUEUE: "Hàng đợi",
  OVERALL: "Tổng thể",
};

export default async function FeedbackPage() {
  const { scopeLocationIds } = await getScope();
  const { items, avg, scoreDistribution, topTags, satisfactionRate } = await getFeedbacks(scopeLocationIds);
  const maxDistribution = Math.max(1, ...scoreDistribution.map((item) => item.count));

  return (
    <div>
      <PageHeader
        title="Đánh giá dịch vụ"
        description="Theo dõi mức độ hài lòng, chất lượng phục vụ và góp ý được gửi trực tiếp từ kiosk."
      />

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Metric label="Tổng đánh giá" value={avg._count.id} />
        <Metric label="Điểm hài lòng TB" value={`${avg._avg.score?.toFixed(1) ?? "—"} / 5`} color="#D97706" />
        <Metric label="Chất lượng TB" value={`${avg._avg.starRating?.toFixed(1) ?? "—"} ★`} color="#F59E0B" />
        <Metric label="Tỷ lệ hài lòng" value={`${satisfactionRate}%`} color="#16A34A" />
      </section>

      {items.length > 0 && (
        <section className="mb-6 grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">Phân bố mức hài lòng</h2>
            <div className="grid gap-3">
              {[...scoreDistribution].reverse().map((item) => (
                <div key={item.score} className="grid grid-cols-[70px_1fr_40px] items-center gap-3 text-sm">
                  <span className="font-semibold text-slate-600">{item.score} điểm</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(item.count / maxDistribution) * 100}%`,
                        background: item.score >= 4 ? "#16A34A" : item.score === 3 ? "#D97706" : "#DC2626",
                      }}
                    />
                  </div>
                  <span className="text-right font-bold text-slate-700">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">Nội dung nổi bật</h2>
            {topTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {topTags.map(({ tag, count }) => (
                  <span key={tag} className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700">
                    {tag} · {count}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Chưa có nhãn đánh giá.</p>
            )}
          </div>
        </section>
      )}

      {items.length === 0 ? (
        <EmptyState title="Chưa có đánh giá" detail="Đánh giá sẽ xuất hiện ngay sau khi công dân gửi từ kiosk." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((feedback) => {
            const location = feedback.session.device.location?.name;
            const device = feedback.session.device.serialNumber;
            return (
              <article key={feedback.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-2xl font-black"
                      style={{ color: feedback.score >= 4 ? "#16A34A" : feedback.score === 3 ? "#D97706" : "#DC2626" }}
                    >
                      {feedback.score}
                    </span>
                    <span className="text-sm text-slate-400">/ 5</span>
                  </div>
                  <span className="text-sm text-amber-500">{STARS[feedback.starRating ?? feedback.score]}</span>
                </div>

                {feedback.comment && (
                  <p className="mb-3 rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                    “{feedback.comment}”
                  </p>
                )}

                {feedback.tags.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-1">
                    {feedback.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-600">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <dl className="grid gap-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                  <div className="flex justify-between gap-3">
                    <dt>Đối tượng</dt>
                    <dd className="font-semibold text-slate-600">{TARGET_LABELS[feedback.targetType] ?? feedback.targetType}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Kiosk</dt>
                    <dd className="truncate font-semibold text-slate-600">{location ?? device}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Thời gian</dt>
                    <dd className="font-semibold text-slate-600">{fmt(feedback.createdAt)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
