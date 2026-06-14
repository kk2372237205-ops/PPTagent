import * as tencentcloud from "tencentcloud-sdk-nodejs";

export function smsConfigured() {
  return Boolean(
    process.env.TENCENT_SECRET_ID &&
    process.env.TENCENT_SECRET_KEY &&
    process.env.TENCENT_SMS_APP_ID &&
    process.env.TENCENT_SMS_SIGN_NAME &&
    process.env.TENCENT_SMS_TEMPLATE_ID
  );
}

export async function sendVerificationSms(phone: string, code: string) {
  if (!smsConfigured()) return { mode: "development" as const };

  const SmsClient = tencentcloud.sms.v20210111.Client;
  const client = new SmsClient({
    credential: {
      secretId: process.env.TENCENT_SECRET_ID!,
      secretKey: process.env.TENCENT_SECRET_KEY!
    },
    region: process.env.TENCENT_SMS_REGION || "ap-guangzhou",
    profile: {
      httpProfile: { endpoint: "sms.tencentcloudapi.com" }
    }
  });

  const response = await client.SendSms({
    SmsSdkAppId: process.env.TENCENT_SMS_APP_ID!,
    SignName: process.env.TENCENT_SMS_SIGN_NAME!,
    TemplateId: process.env.TENCENT_SMS_TEMPLATE_ID!,
    TemplateParamSet: [code, "5"],
    PhoneNumberSet: [`+86${phone}`]
  });
  const result = response.SendStatusSet?.[0];
  if (!result || result.Code !== "Ok") {
    throw new Error(result?.Message || "腾讯云短信发送失败");
  }
  return { mode: "tencent" as const };
}
