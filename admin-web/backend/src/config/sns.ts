import { SNSClient } from "@aws-sdk/client-sns";
import { AppError } from "../middleware/errorHandler";

let snsClient: SNSClient | null = null;

function getRegion(): string {
  const value = process.env.AWS_REGION?.trim();
  if (!value) {
    throw new AppError("AWS_REGION must be configured", 500);
  }
  return value;
}

export function getSnsClient(): SNSClient {
  if (snsClient) {
    return snsClient;
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();

  snsClient = new SNSClient({
    region: getRegion(),
    ...(accessKeyId && secretAccessKey
      ? { credentials: { accessKeyId, secretAccessKey } }
      : {}),
  });

  return snsClient;
}

/** ARN of the SNS Platform Application (FCM/GCM) for the Teacher Android app. */
export function getAndroidPlatformApplicationArn(): string | null {
  const arn = process.env.SNS_ANDROID_PLATFORM_ARN?.trim();
  return arn || null;
}

export function requireAndroidPlatformApplicationArn(): string {
  const arn = getAndroidPlatformApplicationArn();
  if (!arn) {
    throw new AppError("SNS_ANDROID_PLATFORM_ARN must be configured", 500);
  }
  return arn;
}
