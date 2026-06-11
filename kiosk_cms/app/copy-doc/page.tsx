import Link from "next/link";
import { getCopyDocCategories, getCopyDocStats } from "../lib/data";
import { EmptyState, Metric, PageHeader, Table, Td, fmt } from "../components";

export const dynamic = "force-dynamic";

const STATUS_VI: Record<string, string> = {
  INITIATED:      "Đã khởi tạo",
  SCAN_PENDING:   "Chờ chụp",
  SCAN_IN_PROGRESS: "Đang chụp",
  SCAN_COMPLETE:  "Đã chụp xong",
  AI_PROCESSING:  "AI đang xử lý",
  PREVIEW_READY:  "Xem trước",
  ADJUSTED:       "Đã căn chỉnh",
  FEE_PENDING:    "Chờ xác nhận phí",
  FEE_CONFIRMED:  "Đã xác nhận phí",
  GENERATING_PDF: "Đang tạo PDF",
  PRINT_QUEUED:   "Chờ in",
  PRINTING:       "Đang in",
  COMPLETED:      "Hoàn thành",
  FAILED:         "Thất bại",
  CANCELLED:      "Đã huỷ",
};

export default async function CopyDocOverviewPage() {
  const [categories, stats] = await Promise.all([
    getCopyDocCategories(),
    getCopyDocStats(),
  ]);

  return (
    <div>
      <PageHeader
        title="Sao y tài liệu điện tử"
        description="Cấu hình loại giấy tờ, lệ phí, từ khoá OCR nhận diện tự động và giám sát yêu cầu sao y."
      />

      {/* Stats */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        <Metric label="Tổng yêu cầu" value={stats.total} />
        <Metric label="Đang xử lý"   value={stats.pending}   color="#D97706" />
        <Metric label="Hoàn thành"   value={stats.completed} color="#16A34A" />
        <Metric label="Thất bại"     value={stats.failed}    color="#DC2626" />
      </div>

      {/* Quick links */}
      <div className="mb-8 flex gap-4">
        <Link
          href="/copy-doc/categories"
          className="rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm hover:border-blue-400 hover:shadow-md transition-all"
        >
          <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Cấu hình</p>
          <p className="mt-1 text-lg font-black text-slate-900">Loại giấy tờ & Lệ phí</p>
          <p className="mt-1 text-sm text-slate-500">OCR keywords, lệ phí theo bậc, cấu hình PDF</p>
        </Link>
        <Link
          href="/copy-doc/requests"
          className="rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm hover:border-blue-400 hover:shadow-md transition-all"
        >
          <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Giám sát</p>
          <p className="mt-1 text-lg font-black text-slate-900">Yêu cầu sao y</p>
          <p className="mt-1 text-sm text-slate-500">Theo dõi trạng thái, hàng đợi in</p>
        </Link>
      </div>

      {/* Categories summary */}
      <h2 className="mb-4 text-xl font-black text-slate-900">
        Loại giấy tờ ({categories.length})
      </h2>

      {categories.length === 0 ? (
        <EmptyState
          title="Chưa có loại giấy tờ nào"
          detail="Tạo loại giấy tờ để bắt đầu cấu hình dịch vụ sao y."
        />
      ) : (
        <Table headers={["Mã", "Tên loại", "Giá/bản sao", "OCR Keywords", "Từ khoá OCR", "Yêu cầu", "Trạng thái", ""]}>
          {categories.map((cat) => (
            <tr key={cat.id} className="border-t border-slate-100 hover:bg-slate-50">
              <Td><span className="font-mono text-xs">{cat.code}</span></Td>
              <Td bold>{cat.name}{cat.nameEn && <span className="ml-2 text-xs text-slate-400 font-normal">{cat.nameEn}</span>}</Td>
              <Td>
                <span className="font-bold text-blue-700">
                  {Number(cat.pricePerCopy).toLocaleString("vi-VN")}đ
                </span>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1 max-w-[200px]">
                  {cat.ocrKeywords.slice(0, 3).map((kw: string) => (
                    <span key={kw} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{kw}</span>
                  ))}
                  {cat.ocrKeywords.length > 3 && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">+{cat.ocrKeywords.length - 3}</span>
                  )}
                  {cat.ocrKeywords.length === 0 && <span className="text-xs text-slate-400">Chưa cấu hình</span>}
                </div>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1 max-w-[160px]">
                  {cat.ocrDocTypes.slice(0, 2).map((dt: string) => (
                    <span key={dt} className="rounded bg-orange-50 px-2 py-0.5 font-mono text-xs text-orange-700">{dt}</span>
                  ))}
                  {cat.ocrDocTypes.length > 2 && (
                    <span className="text-xs text-slate-400">+{cat.ocrDocTypes.length - 2}</span>
                  )}
                </div>
              </Td>
              <Td>{cat._count.requests}</Td>
              <Td>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cat.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                  {cat.isActive ? "Đang hoạt động" : "Tắt"}
                </span>
              </Td>
              <Td>
                <Link href={`/copy-doc/categories/${cat.id}`}
                  className="text-xs font-semibold text-blue-600 hover:underline">
                  Chỉnh sửa →
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
