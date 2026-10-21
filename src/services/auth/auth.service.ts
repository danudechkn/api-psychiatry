export class authService {
  /**
   * ตรวจสอบว่า clientId และ secretKey ตรงกับค่าใน Environment หรือไม่
   */
  static validateCredentials(clientId?: string, secretKey?: string): boolean {
    const expectedClientId = process.env.CLIENT_ID || process.env.ClIENT_ID;
    const expectedSecretKey = process.env.SECRET_KEY;

    if (!clientId || !secretKey) {
      return false;
    }

    return clientId === expectedClientId && secretKey === expectedSecretKey;
  }
}