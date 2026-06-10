"use client";
import React, { useState } from "react";
import { TopBar } from "../ui";
import { Icon } from "../icons";
import { FEEDBACK_TAGS } from "../data";
import { feedbackApi } from "../../lib/api";

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onHome: () => void;
  onHelp: () => void;
  sessionId: string;
  onComplete: () => void;
}

const EMOJIS = [
  { emoji: "😠", vi: "Rất không hài lòng", en: "Very dissatisfied", score: 1, color: "#EF4444" },
  { emoji: "😕", vi: "Không hài lòng", en: "Dissatisfied", score: 2, color: "#F97316" },
  { emoji: "😐", vi: "Bình thường", en: "Neutral", score: 3, color: "#F59E0B" },
  { emoji: "🙂", vi: "Hài lòng", en: "Satisfied", score: 4, color: "#22C55E" },
  { emoji: "😄", vi: "Rất hài lòng", en: "Very satisfied", score: 5, color: "#10B981" },
];

export function FeedbackScreen({ lang, onLangChange, onHome, onHelp, sessionId, onComplete }: Props) {
  const [emoji, setEmoji] = useState<number | null>(null);
  const [stars, setStars] = useState(0);
  const [hovStar, setHovStar] = useState(0);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = {
    title: lang === "vi" ? "Đánh giá dịch vụ" : "Service feedback",
    subtitle: lang === "vi" ? "Ý kiến của bạn rất quan trọng với chúng tôi" : "Your feedback helps us improve",
    question: lang === "vi" ? "Bạn cảm thấy thế nào về dịch vụ hôm nay?" : "How was your experience today?",
    quality: lang === "vi" ? "Đánh giá chất lượng" : "Service quality",
    highlights: lang === "vi" ? "Chọn điểm nổi bật (tùy chọn)" : "Select highlights (optional)",
    comment: lang === "vi" ? "Ý kiến thêm (tùy chọn)" : "Additional comments (optional)",
    placeholder: lang === "vi" ? "Nhập góp ý để chúng tôi phục vụ tốt hơn..." : "Tell us how we can serve you better...",
    submit: lang === "vi" ? "Gửi đánh giá" : "Submit feedback",
    submitting: lang === "vi" ? "Đang gửi..." : "Submitting...",
    thanks: lang === "vi" ? "Cảm ơn bạn đã đánh giá!" : "Thank you for your feedback!",
    thanksDetail: lang === "vi"
      ? "Phản hồi đã được ghi nhận và sẽ giúp chúng tôi cải thiện dịch vụ."
      : "Your feedback has been recorded and will help us improve.",
    returning: lang === "vi" ? "Đang quay về trang chủ..." : "Returning to home...",
    failed: lang === "vi"
      ? "Không thể gửi đánh giá. Vui lòng kiểm tra kết nối và thử lại."
      : "Could not submit feedback. Check the connection and try again.",
  };

  function toggleTag(tag: string) {
    setTags((previous) => {
      const next = new Set(previous);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  }

  async function submit() {
    if (emoji === null || stars === 0 || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      await feedbackApi.submit({
        sessionId,
        targetType: "SERVICE",
        score: emoji,
        starRating: stars,
        comment: comment.trim() || undefined,
        tags: Array.from(tags),
        language: lang,
      });
      setDone(true);
      window.setTimeout(onComplete, 3500);
    } catch (submitError) {
      console.error("Failed to submit feedback:", submitError);
      setError(text.failed);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div style={{
        width: 1920, height: 1080, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 24,
        background: "#fff", animation: "fadeIn .5s ease both",
      }}>
        <div style={{ fontSize: 96, animation: "pop .5s cubic-bezier(0.34,1.56,0.64,1) both" }}>🎉</div>
        <div style={{ fontSize: 48, fontWeight: 800, color: "var(--green)" }}>{text.thanks}</div>
        <div style={{ fontSize: 20, color: "var(--ink-3)" }}>{text.thanksDetail}</div>
        <div style={{ marginTop: 12, fontSize: 16, color: "var(--ink-5)" }}>{text.returning}</div>
      </div>
    );
  }

  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
      <TopBar
        lang={lang}
        onLangChange={onLangChange}
        onHome={onHome}
        onHelp={onHelp}
        title={text.title}
        subtitle={text.subtitle}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 26 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--ink-1)", marginBottom: 20 }}>
            {text.question}
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            {EMOJIS.map((item) => {
              const selected = emoji === item.score;
              return (
                <button
                  key={item.score}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setEmoji(item.score)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
                    padding: "18px 24px", borderRadius: 20,
                    background: selected ? `${item.color}18` : "#fff",
                    border: `2px solid ${selected ? item.color : "var(--ink-7)"}`,
                    cursor: "pointer", transform: selected ? "scale(1.08)" : "scale(1)",
                    transition: "all .2s cubic-bezier(0.34,1.56,0.64,1)",
                    boxShadow: selected ? `0 8px 24px ${item.color}30` : "var(--shadow-sm)",
                  }}
                >
                  <span style={{ fontSize: 56, lineHeight: 1, filter: selected ? "none" : "grayscale(0.4)" }}>{item.emoji}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: selected ? item.color : "var(--ink-4)", maxWidth: 120 }}>
                    {lang === "vi" ? item.vi : item.en}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--ink-1)", marginBottom: 12 }}>{text.quality}</div>
          <div style={{ display: "flex", gap: 12 }}>
            {[1, 2, 3, 4, 5].map((star) => {
              const filled = star <= (hovStar || stars);
              return (
                <button
                  key={star}
                  type="button"
                  aria-label={`${star} star`}
                  onClick={() => setStars(star)}
                  onPointerEnter={() => setHovStar(star)}
                  onPointerLeave={() => setHovStar(0)}
                  style={{
                    background: "none", border: "none", cursor: "pointer", padding: 4,
                    transform: filled ? "scale(1.15)" : "scale(1)",
                    transition: "transform .15s cubic-bezier(0.34,1.56,0.64,1)",
                  }}
                >
                  <Icon name="star" size={44} style={{ color: filled ? "var(--orange)" : "var(--ink-6)" }} />
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-3)", marginBottom: 12 }}>{text.highlights}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", maxWidth: 900 }}>
            {FEEDBACK_TAGS.map((tag) => {
              const selected = tags.has(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  style={{
                    padding: "10px 24px", borderRadius: 999, fontSize: 15, fontWeight: 600, cursor: "pointer",
                    background: selected ? "var(--blue)" : "#fff",
                    color: selected ? "#fff" : "var(--ink-3)",
                    border: `1.5px solid ${selected ? "var(--blue)" : "var(--ink-6)"}`,
                    transition: "all .2s",
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        <label style={{ width: 760, display: "grid", gap: 8, fontSize: 15, fontWeight: 600, color: "var(--ink-3)" }}>
          {text.comment}
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, 1000))}
            placeholder={text.placeholder}
            rows={2}
            style={{
              width: "100%", resize: "none", borderRadius: 16, border: "1.5px solid var(--ink-6)",
              background: "#fff", padding: "14px 16px", color: "var(--ink-1)", font: "inherit",
              outline: "none", boxShadow: "var(--shadow-sm)",
            }}
          />
        </label>

        {error && <div role="alert" style={{ color: "#DC2626", fontSize: 15, fontWeight: 600 }}>{error}</div>}

        <button
          type="button"
          onClick={submit}
          disabled={emoji === null || stars === 0 || submitting}
          className="btn btn-primary btn-xl"
          style={{ minWidth: 320, gap: 12, opacity: emoji === null || stars === 0 || submitting ? 0.5 : 1 }}
        >
          <Icon name="send" size={22} />
          {submitting ? text.submitting : text.submit}
        </button>
      </div>
    </div>
  );
}
