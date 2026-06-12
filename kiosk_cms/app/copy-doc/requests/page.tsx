import { getCopyDocRequests, getCopyDocStats } from "../../lib/data";
import { getScope } from "../../lib/session";
import { PageHeader, Metric } from "../../components";
import { RequestsClient } from "./RequestsClient";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const { scopeLocationIds } = await getScope();
  const [requests, stats] = await Promise.all([
    getCopyDocRequests(undefined, 100, scopeLocationIds),
    getCopyDocStats(scopeLocationIds),
  ]);

  return (
    <div>
      <PageHeader
        title="Yêu cầu sao y"
        description="Theo dõi trạng thái các yêu cầu sao y, hàng đợi in và lịch sử xử lý."
      />

      {/* Stats */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <Metric label="Tổng yêu cầu"   value={stats.total} />
        <Metric label="Đang xử lý"     value={stats.pending}   color="#D97706" />
        <Metric label="Hoàn thành"     value={stats.completed} color="#16A34A" />
        <Metric label="Thất bại / Huỷ" value={stats.failed}   color="#DC2626" />
      </div>

      <RequestsClient requests={requests.map(r => ({
        ...r,
        baseFee:       Number(r.baseFee),
        processingFee: Number(r.processingFee),
        totalFee:      Number(r.totalFee),
        // The included category carries Decimal fields — serialise them too.
        category: r.category
          ? {
              ...r.category,
              pricePerCopy:      Number(r.category.pricePerCopy),
              processingFeeRate: Number(r.category.processingFeeRate),
            }
          : null,
      }))} />
    </div>
  );
}
