import { createHmac, randomUUID } from "crypto";

type SmsMode = "mock" | "aliyun";

type SmsResult = {
  mode: SmsMode;
};

const aliyunEndpoint = "https://dysmsapi.aliyuncs.com/";

export function smsProvider(): SmsMode {
  return process.env.SMS_PROVIDER === "aliyun" ? "aliyun" : "mock";
}

export function smsConfigured() {
  if (smsProvider() === "mock") return true;
  return Boolean(
    process.env.ALIYUN_ACCESS_KEY_ID &&
      process.env.ALIYUN_ACCESS_KEY_SECRET &&
      process.env.ALIYUN_SMS_SIGN_NAME &&
      process.env.ALIYUN_SMS_TEMPLATE_CODE,
  );
}

function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

function signAliyunParams(params: Record<string, string>, secret: string) {
  const canonical = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `POST&%2F&${percentEncode(canonical)}`;
  return createHmac("sha1", `${secret}&`).update(stringToSign).digest("base64");
}

async function sendAliyunSms(phone: string, code: string): Promise<SmsResult> {
  if (!smsConfigured()) {
    throw new Error("阿里云短信未配置完整，请检查 ALIYUN_* 环境变量");
  }

  const params: Record<string, string> = {
    AccessKeyId: process.env.ALIYUN_ACCESS_KEY_ID!,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: phone,
    RegionId: process.env.ALIYUN_SMS_REGION || "cn-hangzhou",
    SignName: process.env.ALIYUN_SMS_SIGN_NAME!,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: randomUUID(),
    SignatureVersion: "1.0",
    TemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE!,
    TemplateParam: JSON.stringify({ code }),
    Timestamp: new Date().toISOString(),
    Version: "2017-05-25",
  };
  params.Signature = signAliyunParams(
    params,
    process.env.ALIYUN_ACCESS_KEY_SECRET!,
  );

  const response = await fetch(aliyunEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const result = (await response.json()) as {
    Code?: string;
    Message?: string;
  };

  if (!response.ok || result.Code !== "OK") {
    throw new Error(result.Message || "阿里云短信发送失败");
  }

  return { mode: "aliyun" };
}

export async function sendVerificationSms(
  phone: string,
  code: string,
): Promise<SmsResult> {
  if (smsProvider() === "mock") return { mode: "mock" };
  return sendAliyunSms(phone, code);
}
