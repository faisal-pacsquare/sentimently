import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

export interface GoogleIdentity {
  email: string;
  name?: string;
}

/** Checks a Google ID token with Google's tokeninfo endpoint and our client id. */
@Injectable()
export class GoogleVerifier {
  async verify(idToken: string): Promise<GoogleIdentity> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId)
      throw new ServiceUnavailableException('Google sign-in is not configured');

    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    );
    if (!res.ok) throw new UnauthorizedException('Google sign-in failed');
    const info = (await res.json()) as {
      aud?: string;
      iss?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
    };

    const issuerOk =
      info.iss === 'accounts.google.com' ||
      info.iss === 'https://accounts.google.com';
    const verified =
      info.email_verified === true || info.email_verified === 'true';
    if (info.aud !== clientId || !issuerOk || !verified || !info.email) {
      throw new UnauthorizedException('Google sign-in failed');
    }
    return { email: info.email, name: info.name };
  }
}
