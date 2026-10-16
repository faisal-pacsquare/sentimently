import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { Customer, publicCustomer } from '../customers/customer.types';
import { MAILER, Mailer } from '../mail/mailer';
import { JsonStore } from '../storage/json-store.service';
import { GoogleVerifier } from './google.verifier';
import { hashPassword, newToken, sha256, verifyPassword } from './password';

const RESET_TTL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const normalise = (email: string) => email.trim().toLowerCase();
/** A real account: it can sign in. Guest records (created at checkout) cannot. */
const isAccount = (c: Customer) => !c.isGuest && !c.deletedAt;
/** Team accounts are made by an admin, and a confirmed address is the owner's: neither may be replaced. */
const proven = (c: Customer) => !!c.emailVerified || c.role !== 'customer';

/** Switches a record off for good: it can no longer sign in and its tokens stop working at once. */
function deactivate(c: Customer, now: string) {
  c.email = `replaced-${c.id}@replaced.invalid`;
  c.isGuest = true;
  c.deletedAt = now;
  c.updatedAt = now;
  delete c.passwordHash;
  delete c.verifyTokenHash;
  delete c.resetTokenHash;
}

/**
 * Accounts and guests are kept apart on purpose.
 * Anyone can type any email address when registering, so registering must never hand over orders placed
 * as a guest with that address. Guest orders never move on their own: a signed-in customer adds one to
 * their account by proving they own it (order number + email, see MeService.claimOrder).
 *
 * An address that was registered but never confirmed does not belong to anyone yet. If the real owner
 * registers or signs in with Google, the unconfirmed record is switched off and replaced, so a stranger
 * who registered first cannot keep a password on someone else's account. Resetting a password through the
 * emailed link does the same job for a confirmed account: it replaces whatever password was there.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  // Verified against when the email is unknown, so timing does not reveal which emails exist.
  private dummyHash?: Promise<string>;

  constructor(
    private readonly store: JsonStore,
    private readonly jwt: JwtService,
    private readonly google: GoogleVerifier,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD, if set and no admin exists yet. */
  async onModuleInit() {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password) return;
    const existing = await this.store.findOne<Customer>(
      'customers',
      (c) => c.role === 'admin',
    );
    if (existing) return;
    const passwordHash = await hashPassword(password);
    const address = normalise(email);
    const now = new Date().toISOString();
    await this.store.mutate('customers', (docs) => {
      const old = docs.find(
        (d) => isAccount(d as Customer) && (d as Customer).email === address,
      ) as Customer | undefined;
      if (old) deactivate(old, now);
      docs.push({
        id: randomUUID(),
        email: address,
        role: 'admin',
        authProvider: 'email',
        passwordHash,
        isGuest: false,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      } as Customer);
    });
    this.logger.log(`Admin account ready for ${address}`);
  }

  async register(dto: { email: string; password: string; name?: string }) {
    const email = normalise(dto.email);
    const passwordHash = await hashPassword(dto.password);
    const token = newToken();
    const now = new Date().toISOString();

    const customer = await this.store.mutate('customers', (docs) => {
      const existing = docs.find(
        (d) => isAccount(d as Customer) && (d as Customer).email === email,
      ) as Customer | undefined;
      if (existing && proven(existing))
        throw new ConflictException(
          'An account with this email already exists',
        );
      if (existing) deactivate(existing, now); // never confirmed by anyone: replaced, not kept
      const created: Customer = {
        id: randomUUID(),
        email,
        name: dto.name,
        role: 'customer',
        authProvider: 'email',
        passwordHash,
        isGuest: false,
        emailVerified: false,
        verifyTokenHash: sha256(token),
        verifyExpiresAt: new Date(Date.now() + VERIFY_TTL_MS).toISOString(),
        createdAt: now,
        updatedAt: now,
      };
      docs.push(created);
      return structuredClone(created);
    });
    await this.sendVerification(email, token);
    return this.session(customer);
  }

  async login(dto: { email: string; password: string }) {
    const customer = await this.store.findOne<Customer>(
      'customers',
      (c) => isAccount(c) && c.email === normalise(dto.email),
    );
    this.dummyHash ??= hashPassword('not-a-real-password');
    const ok = await verifyPassword(
      dto.password,
      customer?.passwordHash ?? (await this.dummyHash),
    );
    if (!customer || !customer.passwordHash || !ok)
      throw new UnauthorizedException('Invalid email or password');
    return this.session(customer);
  }

  /**
   * Google has already checked that the address belongs to this person.
   * A confirmed account for the address is signed in to. An unconfirmed one was made by someone else and is replaced.
   */
  async loginWithGoogle(idToken: string) {
    const identity = await this.google.verify(idToken);
    const email = normalise(identity.email);
    const now = new Date().toISOString();
    const customer = await this.store.mutate('customers', (docs) => {
      const existing = docs.find(
        (d) => isAccount(d as Customer) && (d as Customer).email === email,
      ) as Customer | undefined;
      if (existing && proven(existing)) {
        existing.name ??= identity.name;
        existing.emailVerified = true;
        if (!existing.passwordHash) existing.authProvider = 'google';
        existing.updatedAt = now;
        return structuredClone(existing);
      }
      if (existing) deactivate(existing, now);
      const created: Customer = {
        id: randomUUID(),
        email,
        name: identity.name,
        role: 'customer',
        authProvider: 'google',
        isGuest: false,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };
      docs.push(created);
      return structuredClone(created);
    });
    return this.session(customer);
  }

  async verifyEmail(token: string) {
    const hash = sha256(token);
    const customer = await this.store.mutate('customers', (docs) => {
      const c = docs.find((d) => (d as Customer).verifyTokenHash === hash) as
        Customer | undefined;
      if (
        !c ||
        !c.verifyExpiresAt ||
        new Date(c.verifyExpiresAt) < new Date()
      ) {
        throw new BadRequestException(
          'This confirmation link is invalid or has expired',
        );
      }
      Object.assign(c, {
        emailVerified: true,
        verifyTokenHash: undefined,
        verifyExpiresAt: undefined,
        updatedAt: new Date().toISOString(),
      });
      return structuredClone(c);
    });
    return {
      message: 'Your email address is confirmed.',
      customer: publicCustomer(customer),
    };
  }

  /** For a signed-in customer whose confirmation email never arrived. Replaces the earlier link. */
  async resendVerification(customerId: string) {
    const c = await this.store.get<Customer>('customers', customerId);
    if (!c || c.emailVerified) return;
    const token = newToken();
    await this.store.update<Customer>('customers', customerId, {
      verifyTokenHash: sha256(token),
      verifyExpiresAt: new Date(Date.now() + VERIFY_TTL_MS).toISOString(),
    });
    await this.sendVerification(c.email, token);
  }

  /** Always answers the same way, so the endpoint does not reveal which emails have accounts. */
  async forgotPassword(emailInput: string) {
    const email = normalise(emailInput);
    const customer = await this.store.findOne<Customer>(
      'customers',
      (c) => isAccount(c) && c.email === email,
    );
    if (!customer || !customer.passwordHash) return;
    const token = newToken();
    await this.store.update<Customer>('customers', customer.id, {
      resetTokenHash: sha256(token),
      resetExpiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
    });
    const base = process.env.APP_URL ?? 'http://localhost:3000';
    await this.mailer.send({
      to: email,
      subject: 'Reset your Sentimently password',
      text: `Use this link within one hour to choose a new password:\n${base}/reset-password?token=${token}\n\nIf you did not ask for this, ignore this email.`,
    });
  }

  /** Using the emailed link proves control of the mailbox, so it also confirms the address. */
  async resetPassword(token: string, password: string) {
    const hash = sha256(token);
    const passwordHash = await hashPassword(password);
    await this.store.mutate('customers', (docs) => {
      const c = docs.find((d) => (d as Customer).resetTokenHash === hash) as
        Customer | undefined;
      if (!c || !c.resetExpiresAt || new Date(c.resetExpiresAt) < new Date()) {
        throw new BadRequestException(
          'This reset link is invalid or has expired',
        );
      }
      Object.assign(c, {
        passwordHash,
        resetTokenHash: undefined,
        resetExpiresAt: undefined,
        emailVerified: true,
        verifyTokenHash: undefined,
        verifyExpiresAt: undefined,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  // ---------- helpers ----------

  private async sendVerification(email: string, token: string) {
    const base = process.env.APP_URL ?? 'http://localhost:3000';
    try {
      await this.mailer.send({
        to: email,
        subject: 'Confirm your email address',
        text: `Welcome to Sentimently. Please confirm this is your email address (the link works for 24 hours):\n${base}/verify-email?token=${token}\n\nIf you did not create an account, ignore this email.`,
      });
    } catch (e) {
      // The account exists and can ask for another email; do not fail the sign-up because email is down.
      this.logger.error(
        `Could not send the confirmation email to ${email}: ${String(e)}`,
      );
    }
  }

  private async session(customer: Customer) {
    const accessToken = await this.jwt.signAsync({
      sub: customer.id,
      role: customer.role,
    });
    return { accessToken, customer: publicCustomer(customer) };
  }
}
