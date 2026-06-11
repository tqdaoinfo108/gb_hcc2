import { notFound } from "next/navigation";
import Link from "next/link";
import { getCopyDocCategoryById } from "../../../lib/data";
import { PageHeader, Table, Td, fmt } from "../../../components";
import { updateCategory, deleteCategory, addFeeRule, deleteFeeRule } from "../../actions";

export const dynamic = "force-dynamic";

const FEE_TYPE_LABELS: Record<string, string> = {
  FIXED:       "Cố định",
  PROGRESSIVE: "Lũy tiến",
  EXEMPT:      "Miễn phí",
};

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cat = await getCopyDocCategoryById(id);
  if (!cat) notFound();

  const updateAction = updateCategory.bind(null, id);
  const addRuleAction = addFeeRule.bind(null, id);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/copy-doc/categories" className="text-sm text-blue-600 hover:underline">
          ← Loại giấy tờ
        </Link>
        <span className="text-slate-300">/</span>
        <span className="font-mono text-sm text-slate-500">{cat.code}</span>
      </div>

      <PageHeader
        title={cat.name}
        description={`Cấu hình loại giấy tờ, OCR keywords và lệ phí theo bậc. Mã: ${cat.code}`}
      />

      {/* Edit form */}
      <form action={updateAction} className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-base font-black text-slate-900">Thông tin cơ bản</h2>

        {/* Row 1 */}
        <div className="mb-4 grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Tên tiếng Việt *</label>
            <input name="name" required defaultValue={cat.name}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Tên tiếng Anh</label>
            <input name="nameEn" defaultValue={cat.nameEn ?? ""}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Icon / biểu tượng</label>
            <input name="icon" defaultValue={cat.icon ?? ""}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
        </div>

        {/* Row 2 — pricing */}
        <div className="mb-4 grid grid-cols-4 gap-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Phí/bản sao (₫)</label>
            <input name="pricePerCopy" type="number" defaultValue={Number(cat.pricePerCopy)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Tỷ lệ phí xử lý</label>
            <input name="processingFeeRate" type="number" step="0.01" defaultValue={Number(cat.processingFeeRate)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Tối đa bản/yêu cầu</label>
            <input name="maxCopiesPerRequest" type="number" defaultValue={cat.maxCopiesPerRequest}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Thứ tự</label>
            <input name="sortOrder" type="number" defaultValue={cat.sortOrder}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
        </div>

        {/* OCR config */}
        <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-5">
          <p className="mb-4 text-xs font-bold uppercase tracking-wider text-blue-700">
            Cấu hình OCR — AI tự động nhận diện
          </p>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">
                Từ khoá OCR (phân cách bởi dấu phẩy)
              </label>
              <textarea name="ocrKeywords" rows={3}
                defaultValue={cat.ocrKeywords.join(", ")}
                placeholder="căn cước, cccd, citizen id, số định danh..."
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-500">
                Từ khoá trong văn bản OCR → tự động chọn loại này.
                Kết hợp cả tiếng Việt và tiếng Anh.
              </p>
            </div>

            <div>
              <div className="mb-4">
                <label className="mb-1 block text-xs font-bold text-slate-600">
                  Mã loại tài liệu OCR (phân cách bởi dấu phẩy)
                </label>
                <input name="ocrDocTypes"
                  defaultValue={cat.ocrDocTypes.join(", ")}
                  placeholder="CCCD, NATIONAL_ID, CITIZEN_CARD"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Mã loại do bộ phân loại OCR trả về (cột trọng số cao hơn)
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Điểm tối thiểu</label>
                  <input name="ocrMinScore" type="number" defaultValue={cat.ocrMinScore} min="1"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                  <p className="mt-1 text-xs text-slate-500">Min matches để auto-select</p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">Tên mẫu PDF</label>
                  <input name="pdfTemplateName" defaultValue={cat.pdfTemplateName ?? ""}
                    placeholder="standard_copy"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
            </div>
          </div>

          {/* OCR keyword preview */}
          {cat.ocrKeywords.length > 0 && (
            <div className="mt-4 rounded-xl bg-white p-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">Từ khoá hiện tại:</p>
              <div className="flex flex-wrap gap-1.5">
                {cat.ocrKeywords.map((kw: string) => (
                  <span key={kw} className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">{kw}</span>
                ))}
              </div>
            </div>
          )}
          {cat.ocrDocTypes.length > 0 && (
            <div className="mt-3 rounded-xl bg-white p-3">
              <p className="mb-2 text-xs font-semibold text-slate-500">Mã loại tài liệu OCR:</p>
              <div className="flex flex-wrap gap-1.5">
                {cat.ocrDocTypes.map((dt: string) => (
                  <span key={dt} className="rounded bg-orange-100 px-2 py-0.5 font-mono text-xs font-bold text-orange-800">{dt}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Legal */}
        <div className="mb-5 grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Cơ sở pháp lý</label>
            <input name="legalBasis" defaultValue={cat.legalBasis ?? ""}
              placeholder="Nghị định 23/2015/NĐ-CP"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none" />
          </div>
          <div className="flex items-end gap-6">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="requiresStamp" defaultChecked={cat.requiresStamp}
                className="h-4 w-4 rounded border-slate-300" />
              Yêu cầu đóng dấu
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="isActive" defaultChecked={cat.isActive}
                className="h-4 w-4 rounded border-slate-300" />
              Đang hoạt động
            </label>
          </div>
        </div>

        <div className="flex gap-4">
          <button type="submit"
            className="rounded-xl bg-blue-600 px-8 py-3 text-sm font-bold text-white hover:bg-blue-700 transition-colors">
            Lưu thay đổi
          </button>
          <form action={deleteCategory.bind(null, id)}>
            <button type="submit"
              onClick={e => { if (!confirm(`Xoá loại "${cat.name}"?`)) e.preventDefault(); }}
              className="rounded-xl border border-red-200 bg-red-50 px-6 py-3 text-sm font-bold text-red-600 hover:bg-red-100 transition-colors">
              Xoá loại
            </button>
          </form>
        </div>
      </form>

      {/* Fee Rules */}
      <div className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-base font-black text-slate-900">
          Quy tắc lệ phí theo bậc ({cat.feeRules.length})
        </h2>

        {cat.feeRules.length > 0 && (
          <div className="mb-6">
            <Table headers={["Tên quy tắc", "Từ bản", "Đến bản", "Phí/bản (₫)", "Loại", "Hiệu lực từ", ""]}>
              {cat.feeRules.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <Td bold>{r.ruleName}</Td>
                  <Td>{r.minQuantity}</Td>
                  <Td>{r.maxQuantity ?? "∞"}</Td>
                  <Td>
                    <span className="font-bold text-blue-700">
                      {Number(r.pricePerCopy).toLocaleString("vi-VN")}đ
                    </span>
                  </Td>
                  <Td>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      r.feeType === "EXEMPT" ? "bg-green-100 text-green-700" :
                      r.feeType === "PROGRESSIVE" ? "bg-orange-100 text-orange-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>{FEE_TYPE_LABELS[r.feeType]}</span>
                  </Td>
                  <Td>{fmt(r.effectiveFrom)}</Td>
                  <Td>
                    <form action={deleteFeeRule.bind(null, id, r.id)}>
                      <button type="submit"
                        className="text-xs font-semibold text-red-500 hover:underline">
                        Xoá
                      </button>
                    </form>
                  </Td>
                </tr>
              ))}
            </Table>
          </div>
        )}

        {/* Add fee rule */}
        <form action={addRuleAction} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">Thêm quy tắc lệ phí</p>
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">Tên quy tắc</label>
              <input name="ruleName" required placeholder="VD: Từ bản 5 trở lên"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Từ bản</label>
              <input name="minQuantity" type="number" defaultValue="1" min="1"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Đến bản</label>
              <input name="maxQuantity" type="number" placeholder="∞"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Phí/bản (₫)</label>
              <input name="pricePerCopy" type="number" required min="0"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <select name="feeType"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="FIXED">Cố định</option>
              <option value="PROGRESSIVE">Lũy tiến</option>
              <option value="EXEMPT">Miễn phí</option>
            </select>
            <button type="submit"
              className="rounded-xl bg-slate-800 px-5 py-2 text-xs font-bold text-white hover:bg-slate-700">
              Thêm quy tắc
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
