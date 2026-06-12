import Link from "next/link";
import { getCopyDocCategories } from "../../lib/data";
import { getScope } from "../../lib/session";
import { EmptyState, PageHeader, Table, Td } from "../../components";
import { createCategory } from "../actions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const { selectedLocationId, availableLocations, isSuperAdmin } = await getScope();
  const effectiveLoc =
    selectedLocationId ?? (!isSuperAdmin && availableLocations.length === 1 ? availableLocations[0].id : null);
  const locName = effectiveLoc ? (availableLocations.find((l) => l.id === effectiveLoc)?.name ?? "Địa điểm") : null;
  const categories = await getCopyDocCategories(effectiveLoc);

  return (
    <div>
      <PageHeader
        title="Loại giấy tờ sao y"
        description="Cấu hình loại giấy tờ, mức phí, từ khoá OCR theo từng địa điểm."
      />

      <div className="mb-5 flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
        <span>🗂️</span>
        Đang cấu hình loại giấy tờ cho:{" "}
        <b className="text-[#0068B7]">{locName ?? "Mặc định chung (mọi địa điểm)"}</b>
        {!locName && " — chọn địa điểm ở thanh trên để cấu hình riêng."}
      </div>

      {/* Create form */}
      <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-lg font-black text-slate-900">Thêm loại giấy tờ mới</h2>
        <form action={createCategory} className="space-y-5">
          <input type="hidden" name="locationId" value={effectiveLoc ?? ""} />
          {/* Row 1 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Mã loại *</label>
              <input name="code" required placeholder="VD: CCCD"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Tên tiếng Việt *</label>
              <input name="name" required placeholder="Căn cước công dân"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Tên tiếng Anh</label>
              <input name="nameEn" placeholder="National ID Card"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          {/* Row 2 — pricing */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Phí/bản sao (₫) *</label>
              <input name="pricePerCopy" type="number" required min="0" defaultValue="20000"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Phí xử lý (%)</label>
              <input name="processingFeeRate" type="number" step="0.01" defaultValue="0.10"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Tối đa bản sao</label>
              <input name="maxCopiesPerRequest" type="number" defaultValue="10"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Thứ tự hiển thị</label>
              <input name="sortOrder" type="number" defaultValue="0"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>

          {/* Row 3 — OCR config */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-blue-700">Cấu hình OCR tự động nhận diện</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  Từ khoá OCR (cách nhau bởi dấu phẩy)
                </label>
                <input name="ocrKeywords"
                  placeholder="căn cước, cccd, national id, citizen id, số cccd"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                <p className="mt-1 text-xs text-slate-400">
                  Từ khoá trong văn bản OCR để nhận diện loại giấy tờ này
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Mã loại tài liệu (OCR)</label>
                <input name="ocrDocTypes"
                  placeholder="CCCD, NATIONAL_ID"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Điểm tối thiểu (OCR)</label>
                <input name="ocrMinScore" type="number" defaultValue="1" min="1"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                <p className="mt-1 text-xs text-slate-400">Min keywords match để tự chọn loại</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">Tên mẫu PDF</label>
                <input name="pdfTemplateName" placeholder="standard_copy"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
              </div>
            </div>
          </div>

          {/* Row 4 — legal */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Cơ sở pháp lý</label>
              <input name="legalBasis" placeholder="Nghị định 23/2015/NĐ-CP"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div className="flex items-end gap-6">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="requiresStamp" defaultChecked className="h-4 w-4 rounded border-slate-300" />
                Yêu cầu đóng dấu
              </label>
            </div>
          </div>

          <button type="submit"
            className="rounded-xl bg-blue-600 px-8 py-3 text-sm font-bold text-white hover:bg-blue-700 transition-colors">
            Tạo loại giấy tờ
          </button>
        </form>
      </div>

      {/* List */}
      <h2 className="mb-4 text-lg font-black text-slate-900">Danh sách loại giấy tờ ({categories.length})</h2>

      {categories.length === 0 ? (
        <EmptyState title="Chưa có loại giấy tờ" detail="Sử dụng form trên để thêm loại giấy tờ đầu tiên." />
      ) : (
        <Table headers={["Mã", "Tên", "Phí/bản", "% Xử lý", "OCR Keywords", "OCR DocTypes", "Điểm min", "Yêu cầu", ""]}>
          {categories.map((cat) => (
            <tr key={cat.id} className="border-t border-slate-100 hover:bg-slate-50">
              <Td><span className="font-mono text-xs font-bold">{cat.code}</span></Td>
              <Td bold>
                <div>{cat.name}</div>
                {cat.nameEn && <div className="text-xs text-slate-400 font-normal">{cat.nameEn}</div>}
              </Td>
              <Td>
                <span className="font-bold text-blue-700">
                  {Number(cat.pricePerCopy).toLocaleString("vi-VN")}đ
                </span>
              </Td>
              <Td>{(Number(cat.processingFeeRate) * 100).toFixed(0)}%</Td>
              <Td>
                <div className="flex flex-wrap gap-1 max-w-[200px]">
                  {cat.ocrKeywords.length === 0
                    ? <span className="text-xs italic text-slate-400">Chưa có</span>
                    : cat.ocrKeywords.map((kw: string) => (
                      <span key={kw} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{kw}</span>
                    ))
                  }
                </div>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {cat.ocrDocTypes.map((dt: string) => (
                    <span key={dt} className="rounded bg-orange-50 px-2 py-0.5 font-mono text-xs text-orange-700">{dt}</span>
                  ))}
                </div>
              </Td>
              <Td>{cat.ocrMinScore}</Td>
              <Td>{cat._count.requests}</Td>
              <Td>
                <Link href={`/copy-doc/categories/${cat.id}`}
                  className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-100 transition-colors">
                  Chỉnh sửa
                </Link>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
