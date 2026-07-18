import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taxCode = searchParams.get("taxCode");
    if (!taxCode) {
      return NextResponse.json({ error: "Mã số thuế không được để trống." }, { status: 400 });
    }

    console.log(`Đang tra cứu mã số thuế: ${taxCode}`);

    const response = await fetch(`https://api.vietqr.io/v2/business/${taxCode}`);
    const data = await response.json();

    if (data.code !== "00" || !data.data) {
      return NextResponse.json({ error: data.desc || "Không tìm thấy thông tin doanh nghiệp." }, { status: 400 });
    }

    const business = data.data;
    
    // Trích xuất tỉnh/thành phố từ địa chỉ
    let province = "Khác";
    const address = business.address || "";
    const provinces = ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Bình Dương", "Bắc Ninh"];
    for (const prov of provinces) {
      if (address.toLowerCase().includes(prov.toLowerCase())) {
        province = prov;
        break;
      }
    }
    
    // Nếu không khớp chính xác, thử một số từ viết tắt
    if (province === "Khác") {
      if (address.toLowerCase().includes("hồ chí minh") || address.toLowerCase().includes("hcm")) {
        province = "TP. Hồ Chí Minh";
      } else if (address.toLowerCase().includes("hà nội") || address.toLowerCase().includes("hn")) {
        province = "Hà Nội";
      }
    }

    return NextResponse.json({
      name: business.name,
      tax_code: taxCode,
      province: province,
      address: business.address
    });

  } catch (error: any) {
    console.error("Lỗi tra cứu mã số thuế:", error);
    return NextResponse.json({ error: error.message || "Lỗi máy chủ khi tra cứu mã số thuế." }, { status: 500 });
  }
}
