import QRCode from "qrcode";

export async function authenticatorEnrollment(username, key) {
  const uri = `otpauth://totp/Sun%20Siyam:${encodeURIComponent(username)}?${new URLSearchParams({
    secret: key,
    issuer: "Sun Siyam",
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  })}`;
  const qrCode = await QRCode.toDataURL(uri, {
    errorCorrectionLevel: "M",
    margin: 4,
    width: 280,
  });
  return { uri, qrCode };
}
