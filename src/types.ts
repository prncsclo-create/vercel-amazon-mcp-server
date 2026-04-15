export interface AddToCartParams {
  query?: string;
  asin?: string;
  quantity?: number;
  sessionToken?: string;
}

export interface CartItem {
  title: string;
  price: string;
  quantity: number;
  asin: string;
  imageUrl: string;
}

export interface SearchResult {
  title: string;
  asin: string;
  price: string;
  rating: string;
  imageUrl: string;
}

export interface OperationResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: string;
  sessionToken?: string;
}
