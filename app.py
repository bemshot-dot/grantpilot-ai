from __future__ import annotations

import streamlit as st

from grantpilot.core import (
    answer_question,
    classify_sme,
    generate_dean844_docx,
    load_json,
    match_policies,
    parse_uploaded_text,
    synthetic_prefill,
)


st.set_page_config(page_title="GrantPilot AI", page_icon="GP", layout="wide")

st.markdown(
    """
    <style>
    :root {
      --gp-ink: #17212b;
      --gp-muted: #526070;
      --gp-line: #d8e0e7;
      --gp-teal: #0f766e;
      --gp-gold: #a16207;
      --gp-rose: #be123c;
    }
    .block-container { padding-top: 1.25rem; padding-bottom: 2rem; max-width: 1240px; }
    h1, h2, h3 { letter-spacing: 0; color: var(--gp-ink); }
    [data-testid="stMetricValue"] { font-size: 1.35rem; }
    .gp-caption { color: var(--gp-muted); font-size: 0.92rem; }
    .gp-card {
      border: 1px solid var(--gp-line);
      border-left: 4px solid var(--gp-teal);
      border-radius: 8px;
      padding: 14px 16px;
      margin: 8px 0 12px;
      background: #ffffff;
    }
    .gp-card.warn { border-left-color: var(--gp-gold); }
    .gp-card.low { border-left-color: var(--gp-rose); }
    .gp-badge {
      display: inline-block;
      border: 1px solid var(--gp-line);
      border-radius: 999px;
      padding: 2px 8px;
      margin-right: 6px;
      font-size: 0.82rem;
      color: var(--gp-muted);
      background: #f8fafc;
    }
    .gp-citation {
      font-size: 0.9rem;
      color: var(--gp-muted);
      border-top: 1px solid var(--gp-line);
      padding-top: 8px;
      margin-top: 8px;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


def ensure_state() -> None:
    if "profile" not in st.session_state:
        st.session_state.profile = synthetic_prefill("tech_hanoi")
    if "matches" not in st.session_state:
        st.session_state.matches = match_policies(st.session_state.profile)


def render_citations(citations: list[dict[str, str]]) -> None:
    for citation in citations:
        st.markdown(
            f"""
            <div class="gp-citation">
              <span class="gp-badge">{citation['status']}</span>
              <b>{citation['document']}</b> · {citation['clause']} ·
              <a href="{citation['source']}" target="_blank">nguồn</a>
            </div>
            """,
            unsafe_allow_html=True,
        )


def profile_editor() -> dict:
    profiles = load_json("sample_profiles.json")
    preset_labels = {profile["name"]: profile["id"] for profile in profiles}
    selected_label = st.selectbox("Hồ sơ mẫu", list(preset_labels), index=0)

    col_a, col_b, col_c = st.columns([1.25, 1, 1])
    with col_a:
        if st.button("Nạp hồ sơ mẫu", use_container_width=True):
            st.session_state.profile = synthetic_prefill(preset_labels[selected_label])
            st.session_state.matches = match_policies(st.session_state.profile)
            st.rerun()
    with col_b:
        uploaded = st.file_uploader("OCR mock từ TXT", type=["txt"], label_visibility="collapsed")
    with col_c:
        if uploaded and st.button("Điền từ file", use_container_width=True):
            parsed = parse_uploaded_text(uploaded.getvalue())
            st.session_state.profile.update(parsed)
            st.session_state.matches = match_policies(st.session_state.profile)
            st.rerun()

    profile = dict(st.session_state.profile)
    left, right = st.columns(2)
    with left:
        profile["name"] = st.text_input("Tên doanh nghiệp", profile.get("name", ""))
        profile["tax_code"] = st.text_input("Mã số thuế", profile.get("tax_code", ""))
        profile["province"] = st.selectbox(
            "Tỉnh/thành",
            ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Bình Dương", "Bắc Ninh", "Khác"],
            index=max(0, ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Bình Dương", "Bắc Ninh", "Khác"].index(profile.get("province", "Hà Nội")) if profile.get("province", "Hà Nội") in ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Bình Dương", "Bắc Ninh", "Khác"] else 0),
        )
        profile["industry"] = st.selectbox(
            "Lĩnh vực",
            ["Phần mềm / AI", "Sản xuất", "Công nghệ cao", "Dịch vụ đổi mới sáng tạo", "Thương mại", "Khác"],
            index=max(0, ["Phần mềm / AI", "Sản xuất", "Công nghệ cao", "Dịch vụ đổi mới sáng tạo", "Thương mại", "Khác"].index(profile.get("industry", "Phần mềm / AI")) if profile.get("industry", "Phần mềm / AI") in ["Phần mềm / AI", "Sản xuất", "Công nghệ cao", "Dịch vụ đổi mới sáng tạo", "Thương mại", "Khác"] else 0),
        )
        profile["business_line"] = st.text_area("Mô tả ngành nghề", profile.get("business_line", ""), height=82)
    with right:
        profile["employees"] = st.number_input("Lao động", min_value=0, max_value=5000, value=int(profile.get("employees", 0)), step=1)
        profile["revenue_bil"] = st.number_input("Doanh thu năm gần nhất (tỷ đồng)", min_value=0.0, max_value=10000.0, value=float(profile.get("revenue_bil", 0)), step=1.0)
        profile["capital_bil"] = st.number_input("Vốn (tỷ đồng)", min_value=0.0, max_value=10000.0, value=float(profile.get("capital_bil", 0)), step=1.0)
        profile["startup_innovation"] = st.toggle("Startup đổi mới sáng tạo", value=bool(profile.get("startup_innovation", False)))
        profile["stage"] = st.text_input("Giai đoạn", profile.get("stage", ""))

    contact_a, contact_b, contact_c = st.columns(3)
    with contact_a:
        profile["representative"] = st.text_input("Người đại diện", profile.get("representative", ""))
    with contact_b:
        profile["email"] = st.text_input("Email", profile.get("email", ""))
    with contact_c:
        profile["phone"] = st.text_input("Điện thoại", profile.get("phone", ""))

    if st.button("Chạy matching", type="primary", use_container_width=True):
        st.session_state.profile = profile
        st.session_state.matches = match_policies(profile)
        st.rerun()

    return profile


def render_match_card(policy: dict) -> None:
    css = "gp-card"
    if policy["score"] < 55:
        css += " low"
    elif policy["score"] < 80:
        css += " warn"

    st.markdown(
        f"""
        <div class="{css}">
          <div>
            <span class="gp-badge">{policy['score']}/100</span>
            <span class="gp-badge">{policy['match_level']}</span>
            <span class="gp-badge">{policy['status']}</span>
          </div>
          <h3 style="margin: 8px 0 4px;">{policy['title']}</h3>
          <div class="gp-caption">{policy['program']} · {policy['scope']}</div>
          <p>{policy['summary']}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    reason_col, gap_col = st.columns(2)
    with reason_col:
        st.write("Điểm khớp")
        for reason in policy["reasons"] or ["Cần bổ sung dữ liệu để giải thích điểm khớp."]:
            st.write(f"- {reason}")
    with gap_col:
        st.write("Cần rà soát")
        for gap in policy["gaps"] or ["Chưa phát hiện khoảng trống lớn trong hồ sơ demo."]:
            st.write(f"- {gap}")
    render_citations(policy["citations"])


ensure_state()

st.title("GrantPilot AI")
st.markdown('<div class="gp-caption">Policy & Grant Navigator cho DNNVV và startup đổi mới sáng tạo.</div>', unsafe_allow_html=True)

profile = st.session_state.profile
sme = classify_sme(profile)
top_score = st.session_state.matches[0]["score"] if st.session_state.matches else 0
metric_a, metric_b, metric_c, metric_d = st.columns(4)
metric_a.metric("Phân loại", sme["size"])
metric_b.metric("Chính sách phù hợp", len([m for m in st.session_state.matches if m["score"] >= 55]))
metric_c.metric("Điểm cao nhất", f"{top_score}/100")
metric_d.metric("Citation", sum(len(m["citations"]) for m in st.session_state.matches[:3]))

tab_profile, tab_chat, tab_grant, tab_watch = st.tabs(["Hồ sơ & matching", "Q&A pháp lý", "Hồ sơ 844", "Policy watch"])

with tab_profile:
    left, right = st.columns([0.95, 1.25], gap="large")
    with left:
        edited_profile = profile_editor()
    with right:
        st.subheader("Kết quả match")
        for policy in st.session_state.matches:
            render_match_card(policy)

with tab_chat:
    st.subheader("Q&A có căn cứ")
    golden = [
        "Công ty tôi có phải DNNVV không?",
        "Startup phần mềm ở Hà Nội được hỗ trợ gì?",
        "Đề án 844 cần chuẩn bị hồ sơ gì?",
        "SMEDF có phù hợp với doanh nghiệp sản xuất không?",
        "Sản xuất phần mềm có thuộc ngành nghề ưu đãi đầu tư không?",
        "DNNVV khởi nghiệp sáng tạo được hỗ trợ tư vấn sở hữu trí tuệ không?",
        "Tôi cần citation hiệu lực cho Nghị định 80",
        "Chương trình Hà Nội có dùng để nộp thật ngay không?",
        "Hồ sơ vay vốn cần báo cáo tài chính không?",
        "Công ty ngoài corpus có được miễn toàn bộ thuế không?",
    ]
    selected_question = st.selectbox("Câu hỏi vàng", golden)
    question = st.text_input("Câu hỏi", value=selected_question)
    if st.button("Trả lời", type="primary"):
        answer = answer_question(question, st.session_state.profile)
        st.markdown(f"**{answer.confidence}**")
        st.write(answer.text)
        if answer.citations:
            render_citations(answer.citations)
        st.info("Thông tin trong MVP chỉ phục vụ sàng lọc ban đầu, không thay thế tư vấn pháp lý hoặc xác nhận của cơ quan có thẩm quyền.")

with tab_grant:
    st.subheader("Đề án 844")
    dean844 = next((policy for policy in st.session_state.matches if policy["id"] == "p_dean844"), None)
    if dean844:
        render_match_card(dean844)
        st.write("Checklist hồ sơ")
        for item in dean844["checklist"]:
            st.checkbox(item, value=item in dean844["checklist"][:3])
        docx_bytes = generate_dean844_docx(st.session_state.profile, dean844)
        st.download_button(
            "Xuất đơn đăng ký .docx",
            data=docx_bytes,
            file_name="grantpilot-de-an-844.docx",
            mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            type="primary",
        )

with tab_watch:
    st.subheader("Policy watch")
    watch_items = load_json("policy_watch.json")
    for item in watch_items:
        st.markdown(
            f"""
            <div class="gp-card warn">
              <span class="gp-badge">{item['date']}</span>
              <span class="gp-badge">{item['status']}</span>
              <h3 style="margin: 8px 0 4px;">{item['title']}</h3>
              <p>{item['impact']}</p>
              <div class="gp-citation"><a href="{item['source']}" target="_blank">nguồn theo dõi</a></div>
            </div>
            """,
            unsafe_allow_html=True,
        )
