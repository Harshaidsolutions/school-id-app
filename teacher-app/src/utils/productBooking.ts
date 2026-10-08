import * as Clipboard from "expo-clipboard";
import { Asset } from "expo-asset";
import Share, { Social } from "react-native-share";
import type { HomeProduct } from "../constants/products";

/** Opens a draft with the bundled product image; the user confirms sending in WhatsApp. */
export async function bookProductViaWhatsApp(
  product: HomeProduct,
  phone: string,
): Promise<void> {
  const asset = Asset.fromModule(product.image as number);
  await asset.downloadAsync();
  // Android's native share implementation supports whatsAppNumber, although its
  // published BaseShareSingleOptions type omits this documented option.
  const message = `Hello, I want to buy this product: ${product.name}. Please share the price and availability.`;
  await Clipboard.setStringAsync(message);
  const options = {
    social: Social.Whatsapp,
    whatsAppNumber: phone,
    message,
    title: product.name,
    filename: product.name.replace(/[^a-z0-9]+/gi, "-"),
    url: asset.localUri || asset.uri,
    type: asset.type === "png" ? "image/png" : "image/jpeg",
  } as const;
  await Share.shareSingle(options);
}
