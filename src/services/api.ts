const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzlHwGD2X8jhl8GBNB9OERndhYyUB5Le_n-QyLcLC40wEB7isJoD7d7SnglkPWFDNjgfA/exec";

export interface BackendApiResponse {
  status: string;
  message?: string;
  [key: string]: unknown;
}

export async function callBackendApi(action: string, payload: unknown): Promise<BackendApiResponse> {
  const response = await fetch(GAS_WEB_APP_URL, {
    method: "POST",
    body: JSON.stringify({ action, payload }),
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    throw new Error(`Backend trả về HTTP ${response.status}.`);
  }
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || Array.isArray(result) || !('status' in result)) {
    throw new Error('Backend trả về dữ liệu không đúng định dạng.');
  }
  return result as BackendApiResponse;
}