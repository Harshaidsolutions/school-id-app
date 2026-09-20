import type { ImageSourcePropType } from "react-native";

export type HomeProduct = {
  name: string;
  image: ImageSourcePropType;
};

/** Home → Our Products — order locked to client handwritten list. */
export const HOME_PRODUCTS: HomeProduct[] = [
  { name: "ID Cards", image: require("../../assets/products/id_cards.jpg") },
  { name: "Medals", image: require("../../assets/products/medals.jpg") },
  { name: "Multi colour Belt", image: require("../../assets/products/belts.jpg") },
  { name: "Navara Belts", image: require("../../assets/products/navara_belt.png") },
  { name: "Multi colour Tie", image: require("../../assets/products/ties.jpg") },
  { name: "Normal Tie", image: require("../../assets/products/normal_tie.jpg") },
  { name: "Diaries", image: require("../../assets/products/diaries.jpg") },
  { name: "Progress Cards", image: require("../../assets/products/progress_card.jpg") },
  { name: "Certificates", image: require("../../assets/products/certificate.jpg") },
  { name: "Student Files", image: require("../../assets/products/student_file.jpg") },
  { name: "Rank Badge", image: require("../../assets/products/rank_badges.jpg") },
  { name: "Cloth Badge", image: require("../../assets/products/cloth_badges.jpg") },
  { name: "Key chain", image: require("../../assets/products/key_chains.jpg") },
  { name: "Book covers", image: require("../../assets/products/book_covers.jpg") },
];
