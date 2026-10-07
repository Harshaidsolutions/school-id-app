import {
  CreatePlatformEndpointCommand,
  DeleteEndpointCommand,
  EndpointDisabledException,
  InvalidParameterException,
  PublishCommand,
  SetEndpointAttributesCommand,
} from "@aws-sdk/client-sns";
import {
  getAndroidPlatformApplicationArn,
  getSnsClient,
  requireAndroidPlatformApplicationArn,
} from "../config/sns";

const ANDROID_CHANNEL_ID = "harsha_teacher_alerts_v2";

export type SnsPushPayload = {
  title: string;
  body: string;
  imageUrl?: string | null;
  data?: Record<string, string>;
};

function extractExistingEndpointArn(message: string): string | null {
  const match = message.match(/Endpoint (arn:aws:sns:[^\s]+)/i);
  return match?.[1] ?? null;
}

/** Register or refresh an FCM device token as an SNS platform endpoint. */
export async function registerSnsDeviceEndpoint(
  fcmToken: string,
  options?: { customUserData?: string; existingEndpointArn?: string | null }
): Promise<string> {
  const platformArn = requireAndroidPlatformApplicationArn();
  const client = getSnsClient();
  const token = fcmToken.trim();

  if (options?.existingEndpointArn) {
    await client.send(
      new SetEndpointAttributesCommand({
        EndpointArn: options.existingEndpointArn,
        Attributes: {
          Token: token,
          Enabled: "true",
          ...(options.customUserData
            ? { CustomUserData: options.customUserData.slice(0, 256) }
            : {}),
        },
      })
    );
    return options.existingEndpointArn;
  }

  try {
    const created = await client.send(
      new CreatePlatformEndpointCommand({
        PlatformApplicationArn: platformArn,
        Token: token,
        ...(options?.customUserData
          ? { CustomUserData: options.customUserData.slice(0, 256) }
          : {}),
      })
    );
    const arn = created.EndpointArn?.trim();
    if (!arn) {
      throw new Error("SNS did not return an endpoint ARN");
    }
    return arn;
  } catch (error) {
    if (error instanceof InvalidParameterException) {
      const existingArn = extractExistingEndpointArn(error.message);
      if (existingArn) {
        await client.send(
          new SetEndpointAttributesCommand({
            EndpointArn: existingArn,
            Attributes: {
              Token: token,
              Enabled: "true",
              ...(options?.customUserData
                ? { CustomUserData: options.customUserData.slice(0, 256) }
                : {}),
            },
          })
        );
        return existingArn;
      }
    }
    throw error;
  }
}

export async function deactivateSnsEndpoint(endpointArn: string): Promise<void> {
  const client = getSnsClient();
  try {
    await client.send(
      new SetEndpointAttributesCommand({
        EndpointArn: endpointArn,
        Attributes: { Enabled: "false" },
      })
    );
  } catch (error) {
    console.warn("[sns] deactivate endpoint failed:", endpointArn, error);
  }
}

export async function deleteSnsEndpoint(endpointArn: string): Promise<void> {
  const client = getSnsClient();
  try {
    await client.send(new DeleteEndpointCommand({ EndpointArn: endpointArn }));
  } catch (error) {
    console.warn("[sns] delete endpoint failed:", endpointArn, error);
  }
}

export function buildGcmMessage(payload: SnsPushPayload): string {
  const data = payload.data ?? {};
  const imageUrl = payload.imageUrl?.trim() || "";
  // Data-only so the app receives the message in the foreground, background, and
  // when it is closed, then builds the system notification itself. Legacy FCM
  // notification payloads do not put an image on the Android system tray.
  const dataStrings: Record<string, string> = {
    title: payload.title,
    message: payload.body,
    channelId: ANDROID_CHANNEL_ID,
    sound: "default",
  };
  if (imageUrl) {
    dataStrings.imageUrl = imageUrl;
    dataStrings.image = imageUrl;
  }
  for (const [key, value] of Object.entries(data)) {
    dataStrings[key] = String(value);
  }
  if (data.notificationId) dataStrings.tag = `admin-notification-${data.notificationId}`;
  const message: Record<string, unknown> = {
    data: dataStrings,
    priority: "high",
  };
  // A single data-only message is rendered by Expo's native image-aware builder.
  // Do not also send an FCM notification object: it creates a second display path.
  return JSON.stringify(message);
}

export type SnsSendResult = {
  sent: number;
  failed: number;
  disabledEndpointArns: string[];
};

/** Publish the same notification to multiple SNS endpoint ARNs (deduped). */
export async function sendSnsPushNotifications(
  endpointArns: string[],
  payload: SnsPushPayload
): Promise<SnsSendResult> {
  const platformArn = getAndroidPlatformApplicationArn();
  if (!platformArn) {
    console.warn("[sns] SNS_ANDROID_PLATFORM_ARN not set — skipping mobile push");
    return { sent: 0, failed: 0, disabledEndpointArns: [] };
  }

  const unique = [...new Set(endpointArns.map((a) => a.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return { sent: 0, failed: 0, disabledEndpointArns: [] };
  }

  const client = getSnsClient();
  const gcmBody = buildGcmMessage(payload);
  const message = JSON.stringify({ GCM: gcmBody });
  const disabledEndpointArns: string[] = [];
  let sent = 0;
  let failed = 0;

  for (const endpointArn of unique) {
    try {
      await client.send(
        new PublishCommand({
          TargetArn: endpointArn,
          Message: message,
          MessageStructure: "json",
        })
      );
      sent += 1;
    } catch (error) {
      failed += 1;
      if (
        error instanceof EndpointDisabledException ||
        (error instanceof InvalidParameterException &&
          /disabled|not found|invalid endpoint/i.test(error.message))
      ) {
        disabledEndpointArns.push(endpointArn);
        console.warn("[sns] endpoint disabled/invalid:", endpointArn);
      } else {
        console.error("[sns] publish failed:", endpointArn, error);
      }
    }
  }

  return { sent, failed, disabledEndpointArns };
}
